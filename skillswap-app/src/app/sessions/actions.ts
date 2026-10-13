"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { sendTransactionalEmail } from "@/lib/email/zeptomail";
import { createHash } from "node:crypto";
import { enqueueNotification } from "@/lib/notifications";
import { consumeRateLimit, lockMemberPair } from "@/lib/interaction-policy";
import {
  creditPostingEnabled,
  holdCreditsForConfirmedSession,
  releaseSessionCreditHold,
  settleCompletedCreditSession,
} from "@/lib/credit-ledger";
import { holdDirectSwapDeposits, releaseDirectSwapDeposits } from "@/lib/direct-swap-ledger";
import { refreshMemberTrustLevel } from "@/lib/trust-levels";
import {
  encryptMeetingLink,
  isTimeZone,
  localDateTimeToUtc,
  PROPOSAL_RESPONSE_MS,
  RESCHEDULE_CUTOFF_MS,
  SESSION_BUFFER_MINUTES,
  SESSION_MINUTES,
  validateMeetingLink,
} from "@/lib/sessions";

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
function go(path: string, message: string, key: "error" | "notice" = "error"): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`);
}
function fail(path: string, error: unknown): never {
  unstable_rethrow(error);
  go(path, error instanceof Error ? error.message : "Could not update this session.");
}

async function notify(userId: string, subject: string, message: string, sessionId: string) {
  const digest = createHash("sha256").update(`${sessionId}:${subject}:${message}`).digest("hex");
  await enqueueNotification({
    recipientId: userId,
    category: "SESSION",
    eventKey: "SESSION_UPDATE",
    idempotencyKey: `session:${digest}`,
    title: subject.slice(0, 140),
    body: message.slice(0, 500),
    href: `/sessions/${sessionId}`,
  });
}

async function sessionForMember(sessionId: string, memberId: string) {
  const session = await getPrismaClient().session.findFirst({
    where: { id: sessionId, OR: [{ learnerId: memberId }, { teacherId: memberId }] },
    include: {
      proposals: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!session) throw new Error("This session is not available to your account.");
  return session;
}

async function addReminder(
  sessionId: string,
  userId: string,
  start: Date,
  minutes: number,
  enabled: boolean,
) {
  if (!enabled) return;
  const scheduledFor = new Date(start.getTime() - minutes * 60_000);
  if (scheduledFor <= new Date()) return;
  await getPrismaClient().sessionReminder.createMany({
    data: [{ sessionId, userId, scheduledFor }],
    skipDuplicates: true,
  });
}

async function assertFreeSlot(
  tx: Prisma.TransactionClient,
  sessionId: string,
  learnerId: string,
  teacherId: string,
  startsAt: Date,
) {
  const endsAt = new Date(startsAt.getTime() + (SESSION_MINUTES + SESSION_BUFFER_MINUTES) * 60_000);
  const conflict = await tx.session.findFirst({
    where: {
      id: { not: sessionId },
      status: "CONFIRMED",
      startsAt: { lt: endsAt },
      bufferEndsAt: { gt: startsAt },
      OR: [{ learnerId }, { teacherId }, { learnerId: teacherId, teacherId: learnerId }],
    },
    select: { id: true },
  });
  if (conflict)
    throw new Error(
      "That time overlaps another confirmed session for one of you. Propose another time.",
    );
}

export async function proposeSessionTime(data: FormData) {
  const member = await requireMember();
  const requestId = field(data, "exchangeRequestId");
  const legNumber = Number(field(data, "legNumber") || "1");
  const timezone = field(data, "timezone");
  const start = localDateTimeToUtc(field(data, "startsAtLocal"), timezone);
  const provider = field(data, "meetingProvider");
  const link = field(data, "meetingLink");
  if (
    !start ||
    start.getTime() < Date.now() + 2 * 60 * 60 * 1000 ||
    start.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1000
  )
    go("/sessions/new", "Choose a valid time at least two hours from now and within six months.");
  if (!isTimeZone(timezone)) go("/sessions/new", "Choose a valid IANA time zone.");
  try {
    const meeting = validateMeetingLink(provider, link);
    const request = await getPrismaClient().exchangeRequest.findFirst({
      where: {
        id: requestId,
        status: "ACCEPTED",
        OR: [{ requesterId: member.id }, { recipientId: member.id }],
      },
      select: {
        id: true,
        type: true,
        requesterId: true,
        recipientId: true,
        targetSkillName: true,
        offerSkillName: true,
        targetSkillValueCredits: true,
        offerSkillValueCredits: true,
        targetSkill: { select: { priceCredits: true } },
        offerSkill: { select: { priceCredits: true } },
      },
    });
    if (!request) throw new Error("Choose an accepted exchange request you are part of.");
    if (![1, 2].includes(legNumber) || (request.type === "CREDIT_LEARNING" && legNumber !== 1))
      throw new Error("Choose a valid session leg.");
    if (legNumber === 2 && !request.offerSkillName)
      throw new Error("The second direct-swap skill is unavailable.");
    if (
      legNumber === 2 &&
      !(await getPrismaClient().session.findUnique({
        where: { exchangeRequestId_legNumber: { exchangeRequestId: request.id, legNumber: 1 } },
        select: { id: true },
      }))
    )
      throw new Error("Schedule the first direct-swap session before the second.");
    await consumeRateLimit(member.id, "session-proposal", 10, 60 * 60 * 1000);
    const alreadyExists = await getPrismaClient().session.findUnique({
      where: { exchangeRequestId_legNumber: { exchangeRequestId: request.id, legNumber } },
      select: { id: true },
    });
    if (alreadyExists) throw new Error("A session already exists for this part of the exchange.");
    const learnerId = legNumber === 1 ? request.requesterId : request.recipientId;
    const teacherId = legNumber === 1 ? request.recipientId : request.requesterId;
    const pair = [learnerId, teacherId].sort();
    const [connection, blocked] = await Promise.all([
      getPrismaClient().connection.findFirst({
        where: { memberLowId: pair[0], memberHighId: pair[1], status: "ACTIVE" },
        select: { id: true },
      }),
      getPrismaClient().profileBlock.findFirst({
        where: {
          OR: [
            { blockerId: learnerId, blockedUserId: teacherId },
            { blockerId: teacherId, blockedUserId: learnerId },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (!connection || blocked)
      throw new Error("Sessions require an active, unblocked connection.");
    const meetingLinkEncrypted = meeting.link ? encryptMeetingLink(meeting.link) : null;
    const session = await getPrismaClient().$transaction(
      async (tx) => {
        if (
          await tx.session.findUnique({
            where: { exchangeRequestId_legNumber: { exchangeRequestId: request.id, legNumber } },
            select: { id: true },
          })
        )
          throw new Error("A session already exists for this exchange.");
        const created = await tx.session.create({
          data: {
            exchangeRequestId: request.id,
            legNumber,
            learnerId,
            teacherId,
            priceCredits:
              request.type === "DIRECT_SWAP"
                ? legNumber === 1
                  ? request.targetSkillValueCredits
                  : request.offerSkillValueCredits
                : legNumber === 1
                  ? (request.targetSkill?.priceCredits ?? null)
                  : (request.offerSkill?.priceCredits ?? null),
            meetingProvider: meeting.provider,
            meetingLinkEncrypted,
            proposals: {
              create: {
                proposerId: member.id,
                kind: "INITIAL",
                startsAt: start,
                timezone,
                responseDueAt: new Date(Date.now() + PROPOSAL_RESPONSE_MS),
              },
            },
            events: {
              create: {
                actorId: member.id,
                eventKey: "TIME_PROPOSED",
                toState: "PROPOSED",
                summary: "An initial session time was proposed.",
              },
            },
          },
        });
        return created;
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/sessions");
    await notify(
      member.id === learnerId ? teacherId : learnerId,
      "New session request",
      "A member wants to book a learning session with you. Review the proposed time.",
      session.id,
    );
    go(`/sessions/${session.id}`, "Time proposal sent.", "notice");
  } catch (error) {
    fail("/sessions/new", error);
  }
}

export async function respondToTimeProposal(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const decision = field(data, "decision");
  const sessionPath = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    const proposal = session.proposals[0];
    if (!proposal || proposal.proposerId === member.id)
      throw new Error("There is no proposal awaiting your response.");
    if (
      (proposal.kind === "INITIAL" && session.status !== "PROPOSED") ||
      (proposal.kind === "RESCHEDULE" && session.status !== "CONFIRMED")
    )
      throw new Error("This session changed while the proposal was pending.");
    if (proposal.responseDueAt <= new Date())
      throw new Error("This proposal has expired. Ask the other member to propose a new time.");
    if (decision !== "ACCEPT" && decision !== "DECLINE")
      throw new Error("Choose accept or decline.");
    const counterpartId = member.id === session.learnerId ? session.teacherId : session.learnerId;
    await getPrismaClient().$transaction(
      async (tx) => {
        if (decision === "ACCEPT") {
          await lockMemberPair(tx, session.learnerId, session.teacherId);
          await assertFreeSlot(tx, id, session.learnerId, session.teacherId, proposal.startsAt);
          const directSwap = await tx.directSwap.findFirst({
            where: { exchangeRequest: { sessions: { some: { id } } } },
            include: { exchangeRequest: { include: { sessions: true } } },
          });
          if (directSwap) {
            if (
              directSwap.status === "RESOLUTION_PENDING" ||
              directSwap.status === "MUTUAL_CANCELLATION_PENDING"
            )
              throw new Error("This direct swap is paused for cancellation or Admin review.");
            if (directSwap.exchangeRequest.sessions.length !== 2)
              throw new Error("Schedule both direct-swap sessions before confirming either time.");
            const proposalCounts = await Promise.all(
              directSwap.exchangeRequest.sessions.map((part) =>
                tx.sessionTimeProposal.count({
                  where: { sessionId: part.id, status: { in: ["PENDING", "ACCEPTED"] } },
                }),
              ),
            );
            if (proposalCounts.some((count) => count === 0))
              throw new Error(
                "Propose times for both direct-swap sessions before confirming either one.",
              );
            if (creditPostingEnabled()) {
              await holdDirectSwapDeposits(tx, directSwap.id, member.id);
            }
          }
        }
        await tx.sessionTimeProposal.update({
          where: { id: proposal.id, status: "PENDING" },
          data: {
            status: decision === "ACCEPT" ? "ACCEPTED" : "DECLINED",
            respondedAt: new Date(),
          },
        });
        if (decision === "ACCEPT") {
          const startsAt = proposal.startsAt;
          const endsAt = new Date(startsAt.getTime() + SESSION_MINUTES * 60_000);
          const bufferEndsAt = new Date(endsAt.getTime() + SESSION_BUFFER_MINUTES * 60_000);
          await tx.session.update({
            where: { id },
            data: { status: "CONFIRMED", startsAt, endsAt, bufferEndsAt },
          });
          const confirmed = await tx.session.findUniqueOrThrow({
            where: { id },
            select: {
              exchangeRequest: {
                select: { type: true, directSwap: { select: { id: true, status: true } } },
              },
            },
          });
          if (confirmed.exchangeRequest.type === "CREDIT_LEARNING" && creditPostingEnabled()) {
            await holdCreditsForConfirmedSession(tx, id, member.id);
          }
          if (confirmed.exchangeRequest.directSwap) {
            const swap = confirmed.exchangeRequest.directSwap;
            if (swap.status === "AWAITING_SESSIONS" || swap.status === "AWAITING_DEPOSITS") {
              const nextStatus = creditPostingEnabled() ? "IN_PROGRESS" : "AWAITING_DEPOSITS";
              if (swap.status !== nextStatus) {
                await tx.directSwap.update({
                  where: { id: swap.id },
                  data: { status: nextStatus },
                });
                await tx.directSwapEvent.create({
                  data: {
                    directSwapId: swap.id,
                    actorId: member.id,
                    eventKey: "SESSION_CONFIRMED",
                    fromState: swap.status,
                    toState: nextStatus,
                    summary: creditPostingEnabled()
                      ? "A direct-swap session time was confirmed and both deposits are held."
                      : "A direct-swap session time was confirmed; deposits await settlement enablement.",
                  },
                });
              }
            }
          }
          await tx.sessionReminder.deleteMany({ where: { sessionId: id, sentAt: null } });
          await tx.sessionEvent.create({
            data: {
              sessionId: id,
              actorId: member.id,
              eventKey: "TIME_ACCEPTED",
              fromState: session.status,
              toState: "CONFIRMED",
              summary:
                proposal.kind === "INITIAL"
                  ? "Both members accepted the session time."
                  : "Both members accepted the rescheduled time.",
            },
          });
        } else {
          const state = session.status === "PROPOSED" ? "CANCELLED" : "CONFIRMED";
          await tx.session.update({ where: { id }, data: { status: state } });
          await tx.sessionEvent.create({
            data: {
              sessionId: id,
              actorId: member.id,
              eventKey: "TIME_DECLINED",
              fromState: session.status,
              toState: state,
              summary: "The proposed session time was declined.",
            },
          });
          const directSwap = await tx.directSwap.findFirst({
            where: { exchangeRequest: { sessions: { some: { id } } } },
            select: { id: true, status: true },
          });
          if (
            directSwap &&
            !["SETTLED", "MUTUALLY_CANCELLED", "RESOLVED"].includes(directSwap.status)
          ) {
            await tx.directSwap.update({
              where: { id: directSwap.id },
              data: { status: "RESOLUTION_PENDING" },
            });
            await tx.directSwapEvent.create({
              data: {
                directSwapId: directSwap.id,
                actorId: member.id,
                eventKey: "TIME_DECLINED",
                fromState: directSwap.status,
                toState: "RESOLUTION_PENDING",
                summary:
                  "A direct-swap session time was declined; both sessions and any held deposits need review.",
                metadata: { sessionId: id },
              },
            });
          }
        }
      },
      { isolationLevel: "Serializable" },
    );
    if (decision === "ACCEPT" && session.proposals[0]) {
      const start = session.proposals[0].startsAt;
      await addReminder(
        id,
        session.learnerId,
        start,
        session.learnerReminderMins,
        session.learnerReminderOn,
      );
      await addReminder(
        id,
        session.teacherId,
        start,
        session.teacherReminderMins,
        session.teacherReminderOn,
      );
    }
    revalidatePath("/sessions");
    await notify(
      counterpartId,
      decision === "ACCEPT" ? "SkillSwap session time accepted" : "SkillSwap session time declined",
      decision === "ACCEPT"
        ? "Your session is confirmed."
        : "The proposed session time was declined.",
      id,
    );
    if (decision === "ACCEPT")
      await notify(
        member.id,
        "SkillSwap session confirmed",
        "You accepted the proposed session time. Your session is confirmed.",
        id,
      );
    go(
      sessionPath,
      decision === "ACCEPT" ? "Session time confirmed." : "Proposal declined.",
      "notice",
    );
  } catch (error) {
    fail(sessionPath, error);
  }
}

export async function withdrawTimeProposal(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    const proposal = session.proposals[0];
    if (!proposal || proposal.proposerId !== member.id)
      throw new Error("Only the member who proposed this time can withdraw it.");
    await getPrismaClient().$transaction([
      getPrismaClient().sessionTimeProposal.update({
        where: { id: proposal.id, status: "PENDING" },
        data: { status: "WITHDRAWN", respondedAt: new Date() },
      }),
      getPrismaClient().sessionEvent.create({
        data: {
          sessionId: id,
          actorId: member.id,
          eventKey: "TIME_WITHDRAWN",
          fromState: session.status,
          toState: session.status,
          summary: "The proposed session time was withdrawn.",
        },
      }),
    ]);
    const other = member.id === session.learnerId ? session.teacherId : session.learnerId;
    await notify(
      other,
      "SkillSwap session proposal withdrawn",
      "The pending session time proposal was withdrawn. A new time can be proposed.",
      id,
    );
    revalidatePath("/sessions");
    go(path, "Time proposal withdrawn.", "notice");
  } catch (error) {
    fail(path, error);
  }
}

export async function proposeReschedule(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    if (session.status !== "CONFIRMED" && session.status !== "PROPOSED")
      throw new Error("Only proposed or confirmed sessions can change time.");
    const swapState = await getPrismaClient().directSwap.findFirst({
      where: { exchangeRequest: { sessions: { some: { id } } } },
      select: { status: true },
    });
    if (
      swapState &&
      ["MUTUAL_CANCELLATION_PENDING", "RESOLUTION_PENDING"].includes(swapState.status)
    )
      throw new Error("This direct swap is paused for cancellation or Admin review.");
    if (session.status === "CONFIRMED" && !session.startsAt)
      throw new Error("This session has no confirmed time.");
    const start = localDateTimeToUtc(field(data, "startsAtLocal"), field(data, "timezone"));
    const timezone = field(data, "timezone");
    const reason = field(data, "reason").slice(0, 500) || null;
    if (
      !start ||
      start.getTime() < Date.now() + 2 * 60 * 60 * 1000 ||
      start.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1000
    )
      throw new Error("Choose a valid future time within six months.");
    const currentProposal = session.proposals[0];
    if (currentProposal && currentProposal.responseDueAt > new Date())
      throw new Error("Resolve the pending time proposal before creating another.");
    const late =
      !!session.startsAt && session.startsAt.getTime() - Date.now() < RESCHEDULE_CUTOFF_MS;
    await consumeRateLimit(member.id, "session-proposal", 10, 60 * 60 * 1000);
    await getPrismaClient().$transaction(async (tx) => {
      if (currentProposal)
        await tx.sessionTimeProposal.update({
          where: { id: currentProposal.id },
          data: { status: "EXPIRED", respondedAt: new Date() },
        });
      await tx.sessionTimeProposal.create({
        data: {
          sessionId: id,
          proposerId: member.id,
          kind: session.status === "PROPOSED" ? "INITIAL" : "RESCHEDULE",
          startsAt: start,
          timezone,
          reason,
          responseDueAt: new Date(Date.now() + PROPOSAL_RESPONSE_MS),
        },
      });
      await tx.sessionEvent.create({
        data: {
          sessionId: id,
          actorId: member.id,
          eventKey: session.status === "PROPOSED" ? "TIME_REPROPOSED" : "RESCHEDULE_PROPOSED",
          fromState: session.status,
          toState: session.status,
          summary: late
            ? "A reschedule was proposed within 24 hours; the late change is recorded for review."
            : "A new session time was proposed.",
        },
      });
    });
    const other = member.id === session.learnerId ? session.teacherId : session.learnerId;
    revalidatePath("/sessions");
    await notify(
      other,
      "SkillSwap session time proposed",
      "A member proposed a new time for your session. Please accept or decline the proposal.",
      id,
    );
    go(path, "Time proposal sent.", "notice");
  } catch (error) {
    fail(path, error);
  }
}

export async function cancelSession(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    if (!["PROPOSED", "CONFIRMED"].includes(session.status))
      throw new Error("This session can no longer be cancelled.");
    const reason = field(data, "reason").slice(0, 500) || null;
    const late =
      !!session.startsAt && session.startsAt.getTime() - Date.now() < RESCHEDULE_CUTOFF_MS;
    const counterpartId = member.id === session.learnerId ? session.teacherId : session.learnerId;
    const early =
      !!session.startsAt && session.startsAt.getTime() - Date.now() >= RESCHEDULE_CUTOFF_MS;
    let directSwapCancellation = false;
    await getPrismaClient().$transaction(
      async (tx) => {
        await lockMemberPair(tx, session.learnerId, session.teacherId);
        const directSwap = await tx.directSwap.findFirst({
          where: { exchangeRequest: { sessions: { some: { id } } } },
          select: { id: true, status: true, cancellationRequestedById: true },
        });
        if (directSwap) {
          directSwapCancellation = true;
          if (directSwap.status === "MUTUAL_CANCELLATION_PENDING") {
            throw new Error(
              "A direct-swap cancellation request is already waiting for the other member.",
            );
          }
          if (["SETTLED", "MUTUALLY_CANCELLED", "RESOLVED"].includes(directSwap.status)) {
            throw new Error("This direct swap has already been resolved.");
          }
          await tx.directSwap.update({
            where: { id: directSwap.id },
            data: {
              status: "MUTUAL_CANCELLATION_PENDING",
              cancellationRequestedById: member.id,
              cancellationRequestedAt: new Date(),
              cancellationWasLate: late,
              cancellationConfirmedAt: null,
              cancellationReason: reason,
            },
          });
          await tx.directSwapEvent.create({
            data: {
              directSwapId: directSwap.id,
              actorId: member.id,
              eventKey: "CANCELLATION_REQUESTED",
              fromState: directSwap.status,
              toState: "MUTUAL_CANCELLATION_PENDING",
              summary: `${late ? "Late " : ""}mutual-cancellation request submitted.${reason ? ` Reason: ${reason}` : ""}`,
              metadata: { early, late },
            },
          });
          return;
        }
        await tx.session.update({
          where: { id },
          data: { status: "CANCELLED", cancellationReason: reason },
        });
        await tx.sessionTimeProposal.updateMany({
          where: { sessionId: id, status: "PENDING" },
          data: { status: "WITHDRAWN", respondedAt: new Date() },
        });
        await tx.sessionReminder.deleteMany({ where: { sessionId: id, sentAt: null } });
        await tx.sessionEvent.create({
          data: {
            sessionId: id,
            actorId: member.id,
            eventKey: "CANCELLED",
            fromState: session.status,
            toState: "CANCELLED",
            summary: `${late ? "Late " : ""}cancellation.${reason ? ` Reason: ${reason}` : ""}${late ? " Late change recorded for Phase 8 settlement review." : ""}`,
          },
        });
        if (early && creditPostingEnabled()) {
          await releaseSessionCreditHold(
            tx,
            id,
            member.id,
            "Early cancellation more than 24 hours before session start.",
          );
        }
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/sessions");
    await notify(
      counterpartId,
      "SkillSwap session cancelled",
      directSwapCancellation
        ? "A member requested a mutual cancellation for your direct swap. Review it in your session details."
        : "A member cancelled your session.",
      id,
    );
    go(
      path,
      directSwapCancellation
        ? "Cancellation request sent for both members to review."
        : "Session cancelled.",
      "notice",
    );
  } catch (error) {
    fail(path, error);
  }
}

export async function confirmDirectSwapCancellation(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    await getPrismaClient().$transaction(
      async (tx) => {
        await lockMemberPair(tx, session.learnerId, session.teacherId);
        const swap = await tx.directSwap.findFirst({
          where: { exchangeRequest: { sessions: { some: { id } } } },
          include: { exchangeRequest: { include: { sessions: true } } },
        });
        if (
          !swap ||
          swap.status !== "MUTUAL_CANCELLATION_PENDING" ||
          !swap.cancellationRequestedById ||
          swap.cancellationRequestedById === member.id
        ) {
          throw new Error(
            "There is no cancellation request from the other direct-swap participant.",
          );
        }
        const now = new Date();
        await tx.directSwap.update({
          where: { id: swap.id },
          data: { status: "MUTUALLY_CANCELLED", cancellationConfirmedAt: now },
        });
        for (const part of swap.exchangeRequest.sessions) {
          if (["PROPOSED", "CONFIRMED"].includes(part.status)) {
            await tx.session.update({
              where: { id: part.id },
              data: {
                status: "CANCELLED",
                cancellationReason: swap.cancellationReason || "Mutual direct-swap cancellation.",
              },
            });
          }
          await tx.sessionTimeProposal.updateMany({
            where: { sessionId: part.id, status: "PENDING" },
            data: { status: "WITHDRAWN", respondedAt: now },
          });
          await tx.sessionReminder.deleteMany({ where: { sessionId: part.id, sentAt: null } });
          await tx.sessionEvent.create({
            data: {
              sessionId: part.id,
              actorId: member.id,
              eventKey: "MUTUAL_SWAP_CANCELLATION",
              toState: "CANCELLED",
              summary: "Both participants confirmed cancellation of the direct swap.",
            },
          });
        }
        if (creditPostingEnabled()) {
          await releaseDirectSwapDeposits(
            tx,
            swap.id,
            member.id,
            "Both participants confirmed direct-swap cancellation; return both deposits.",
          );
        }
        await tx.directSwapEvent.create({
          data: {
            directSwapId: swap.id,
            actorId: member.id,
            eventKey: "MUTUAL_CANCELLATION_CONFIRMED",
            fromState: swap.status,
            toState: "MUTUALLY_CANCELLED",
            summary: creditPostingEnabled()
              ? "Both participants confirmed cancellation and both deposits were returned."
              : "Both participants confirmed cancellation; deposits await the credit policy gate.",
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath("/sessions");
    revalidatePath("/exchanges");
    revalidatePath("/admin");
    go(path, "Both participants confirmed the direct-swap cancellation.", "notice");
  } catch (error) {
    fail(path, error);
  }
}

export async function saveMeetingLink(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    if (session.status !== "CONFIRMED")
      throw new Error("Meeting links are available only for confirmed sessions.");
    const provider = field(data, "meetingProvider");
    const input = field(data, "meetingLink");
    if (!input && provider && provider === session.meetingProvider && session.meetingLinkEncrypted)
      go(path, "Your existing meeting link was kept.", "notice");
    const validated = validateMeetingLink(provider, input);
    const encrypted = validated.link ? encryptMeetingLink(validated.link) : null;
    await getPrismaClient().session.update({
      where: { id },
      data: { meetingProvider: validated.provider, meetingLinkEncrypted: encrypted },
    });
    await getPrismaClient().sessionEvent.create({
      data: {
        sessionId: id,
        actorId: member.id,
        eventKey: "MEETING_LINK_UPDATED",
        summary: encrypted
          ? "A meeting link was added or updated."
          : "The meeting link was removed.",
      },
    });
    go(path, encrypted ? "Meeting link saved securely." : "Meeting link removed.", "notice");
  } catch (error) {
    fail(path, error);
  }
}

export async function updateReminderPreference(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    if (session.status !== "CONFIRMED" || !session.startsAt)
      throw new Error("Reminder preferences are available for confirmed sessions.");
    const enabled = field(data, "enabled") === "on";
    const minutes = Number(field(data, "minutes"));
    if (![60, 180, 720, 1440].includes(minutes))
      throw new Error("Choose a supported reminder time.");
    const learner = member.id === session.learnerId;
    await getPrismaClient().$transaction(async (tx) => {
      await tx.session.update({
        where: { id },
        data: learner
          ? { learnerReminderOn: enabled, learnerReminderMins: minutes }
          : { teacherReminderOn: enabled, teacherReminderMins: minutes },
      });
      await tx.sessionReminder.deleteMany({
        where: { sessionId: id, userId: member.id, sentAt: null },
      });
    });
    await addReminder(id, member.id, session.startsAt, minutes, enabled);
    go(path, "Reminder preference saved.", "notice");
  } catch (error) {
    fail(path, error);
  }
}

export async function markSessionComplete(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    if (session.status !== "CONFIRMED" || !session.endsAt || session.endsAt > new Date())
      throw new Error("You can mark the session complete after its scheduled end.");
    const learner = member.id === session.learnerId;
    let bothCompleted = false;
    const trustChanges: Array<{
      userId: string;
      fromLevel: number;
      toLevel: number;
      exchangeCount: number;
    }> = [];
    await getPrismaClient().$transaction(
      async (tx) => {
        await lockMemberPair(tx, session.learnerId, session.teacherId);
        const current = await tx.session.findUnique({
          where: { id },
          include: {
            exchangeRequest: {
              select: { type: true, directSwap: { select: { id: true, status: true } } },
            },
          },
        });
        if (
          !current ||
          current.status !== "CONFIRMED" ||
          !current.endsAt ||
          current.endsAt > new Date()
        )
          throw new Error("This session is no longer eligible for completion.");
        if (
          current.exchangeRequest.directSwap &&
          ["MUTUAL_CANCELLATION_PENDING", "RESOLUTION_PENDING"].includes(
            current.exchangeRequest.directSwap.status,
          )
        )
          throw new Error("This direct swap is paused for cancellation or Admin review.");
        const marked = learner ? current.learnerCompletedAt : current.teacherCompletedAt;
        if (marked) throw new Error("You have already marked this session complete.");
        const otherMarked = learner ? current.teacherCompletedAt : current.learnerCompletedAt;
        bothCompleted = Boolean(otherMarked);
        await tx.session.update({
          where: { id },
          data: learner
            ? {
                learnerCompletedAt: new Date(),
                ...(otherMarked ? { status: "COMPLETED", completedAt: new Date() } : {}),
              }
            : {
                teacherCompletedAt: new Date(),
                ...(otherMarked ? { status: "COMPLETED", completedAt: new Date() } : {}),
              },
        });
        await tx.sessionEvent.create({
          data: {
            sessionId: id,
            actorId: member.id,
            eventKey: "COMPLETION_MARKED",
            fromState: "CONFIRMED",
            toState: otherMarked ? "COMPLETED" : "CONFIRMED",
            summary: otherMarked
              ? "Both members marked the session complete."
              : "One member marked the session complete.",
          },
        });
        if (bothCompleted) {
          const learnerTrust = await refreshMemberTrustLevel(tx, current.learnerId, member.id);
          const teacherTrust = await refreshMemberTrustLevel(tx, current.teacherId, member.id);
          if (learnerTrust) trustChanges.push({ userId: current.learnerId, ...learnerTrust });
          if (teacherTrust) trustChanges.push({ userId: current.teacherId, ...teacherTrust });
        }
        if (
          bothCompleted &&
          creditPostingEnabled() &&
          current.exchangeRequest.type === "CREDIT_LEARNING"
        ) {
          await settleCompletedCreditSession(tx, id, member.id);
        }
        const directSwap = current.exchangeRequest.directSwap;
        if (
          bothCompleted &&
          directSwap &&
          !["SETTLED", "MUTUALLY_CANCELLED", "RESOLVED"].includes(directSwap.status)
        ) {
          const swap = await tx.directSwap.findUniqueOrThrow({
            where: { id: directSwap.id },
            include: {
              exchangeRequest: { include: { sessions: { select: { id: true, status: true } } } },
            },
          });
          if (
            swap.exchangeRequest.sessions.length === 2 &&
            swap.exchangeRequest.sessions.every((part) => part.status === "COMPLETED")
          ) {
            if (creditPostingEnabled()) {
              await releaseDirectSwapDeposits(
                tx,
                swap.id,
                member.id,
                "Both participants completed both direct-swap sessions; return both accountability deposits.",
                true,
              );
            }
            const nextStatus = creditPostingEnabled() ? "SETTLED" : "COMPLETED_PENDING_SETTLEMENT";
            await tx.directSwap.update({ where: { id: swap.id }, data: { status: nextStatus } });
            await tx.directSwapEvent.create({
              data: {
                directSwapId: swap.id,
                actorId: member.id,
                eventKey: "BOTH_LEGS_COMPLETED",
                fromState: directSwap.status,
                toState: nextStatus,
                summary: creditPostingEnabled()
                  ? "Both direct-swap sessions were completed and both deposits were returned."
                  : "Both sessions are complete; deposit return is waiting for the credit policy gate.",
              },
            });
            const requesterTrust = await refreshMemberTrustLevel(tx, swap.requesterId, member.id);
            const recipientTrust = await refreshMemberTrustLevel(tx, swap.recipientId, member.id);
            if (requesterTrust) trustChanges.push({ userId: swap.requesterId, ...requesterTrust });
            if (recipientTrust) trustChanges.push({ userId: swap.recipientId, ...recipientTrust });
          }
        }
      },
      { isolationLevel: "Serializable" },
    );
    for (const change of trustChanges) {
      const trustUser = await getPrismaClient().user.findUnique({
        where: { id: change.userId },
        select: { authUser: { select: { email: true } } },
      });
      if (trustUser?.authUser?.email) {
        try {
          await sendTransactionalEmail({
            to: trustUser.authUser.email,
            subject: `Your SkillSwap Trust Level is now ${change.toLevel}`,
            text: `Your Trust Level increased from ${change.fromLevel} to ${change.toLevel} after ${change.exchangeCount} completed exchanges. A single review does not lower your level.`,
            html: `<p>Your Trust Level increased from ${change.fromLevel} to ${change.toLevel} after ${change.exchangeCount} completed exchanges.</p><p>A single review does not lower your level.</p>`,
          });
        } catch (error) {
          console.error("Trust level notification delivery failed", {
            userId: change.userId,
            error,
          });
        }
      }
    }
    const other = learner ? session.teacherId : session.learnerId;
    await notify(
      other,
      "SkillSwap session completion",
      "Your partner marked the session complete. Mark it complete too when you are ready.",
      id,
    );
    revalidatePath("/sessions");
    go(
      path,
      bothCompleted
        ? "Session completed by both members."
        : "Your completion was recorded. Waiting for your partner.",
      "notice",
    );
  } catch (error) {
    fail(path, error);
  }
}

export async function reportSessionIncident(data: FormData) {
  const member = await requireMember();
  const id = field(data, "sessionId");
  const path = `/sessions/${id}`;
  try {
    const session = await sessionForMember(id, member.id);
    const type = field(data, "type");
    const details = field(data, "details");
    if (type !== "EMERGENCY" && type !== "NO_SHOW") throw new Error("Choose emergency or no-show.");
    if (details.length < 10 || details.length > 2000)
      throw new Error("Add at least 10 characters of context.");
    if (!["CONFIRMED", "CANCELLED"].includes(session.status))
      throw new Error("This session is not eligible for a report.");
    if (!session.startsAt) throw new Error("This session has no scheduled time to report.");
    if (type === "NO_SHOW" && (!session.endsAt || session.endsAt > new Date()))
      throw new Error("No-show reports can be submitted after the session ends.");
    if (
      type === "NO_SHOW" &&
      (member.id === session.learnerId ? session.learnerCompletedAt : session.teacherCompletedAt)
    )
      throw new Error("You already marked this session complete.");
    const reportedUserId = member.id === session.learnerId ? session.teacherId : session.learnerId;
    await consumeRateLimit(member.id, "session-incident", 5, 24 * 60 * 60 * 1000);
    await getPrismaClient().$transaction(async (tx) => {
      await tx.sessionIncident.create({
        data: {
          sessionId: id,
          reporterId: member.id,
          reportedUserId,
          type,
          details,
          sessionStatusBeforeReport: session.status,
        },
      });
      await tx.session.update({
        where: { id },
        data: { status: type === "NO_SHOW" ? "NO_SHOW_REPORTED" : "DISPUTED" },
      });
      await tx.sessionEvent.create({
        data: {
          sessionId: id,
          actorId: member.id,
          eventKey: type === "NO_SHOW" ? "NO_SHOW_REPORTED" : "EMERGENCY_REPORTED",
          fromState: session.status,
          toState: type === "NO_SHOW" ? "NO_SHOW_REPORTED" : "DISPUTED",
          summary:
            type === "NO_SHOW"
              ? "A member reported a possible no-show; Admin review is pending."
              : "A member reported an emergency; Admin review is pending.",
        },
      });
      const directSwap = await tx.directSwap.findFirst({
        where: { exchangeRequest: { sessions: { some: { id } } } },
        select: { id: true, status: true },
      });
      if (directSwap && directSwap.status !== "RESOLUTION_PENDING") {
        await tx.directSwap.update({
          where: { id: directSwap.id },
          data: { status: "RESOLUTION_PENDING" },
        });
        await tx.directSwapEvent.create({
          data: {
            directSwapId: directSwap.id,
            actorId: member.id,
            eventKey: "INCIDENT_REPORTED",
            fromState: directSwap.status,
            toState: "RESOLUTION_PENDING",
            summary:
              "A private emergency or no-show report paused direct-swap settlement for Admin review.",
            metadata: { incidentType: type, sessionId: id },
          },
        });
      }
    });
    revalidatePath("/sessions");
    revalidatePath("/admin");
    go(path, "Report submitted privately for Admin review.", "notice");
  } catch (error) {
    fail(path, error);
  }
}
