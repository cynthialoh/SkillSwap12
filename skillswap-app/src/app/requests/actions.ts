"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ExchangeRequestStatus,
  ExchangeRequestType,
  ResponseVisibility,
} from "@/generated/prisma/client";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { enqueueNotification } from "@/lib/notifications";
import {
  assertAvailableMember,
  assertNoBlock,
  consumeRateLimit,
  createConnection,
  assertNoBlockInTransaction,
  lockMemberPair,
  InteractionError,
} from "@/lib/interaction-policy";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
function go(path: string, message?: string, key = "error"): never {
  redirect(
    path +
      (message ? (path.includes("?") ? "&" : "?") + key + "=" + encodeURIComponent(message) : ""),
  );
}
async function capture(task: () => Promise<void>) {
  try {
    await task();
    return null;
  } catch (error) {
    if (error instanceof InteractionError) return error.message;
    throw error;
  }
}

export async function createLearningRequest(data: FormData) {
  const member = await requireMember();
  const skillListingId = value(data, "skillListingId");
  const title = value(data, "title");
  const scope = value(data, "scope");
  const expectedOutcome = value(data, "expectedOutcome");
  if (
    title.length < 5 ||
    title.length > 120 ||
    scope.length < 10 ||
    scope.length > 1000 ||
    expectedOutcome.length < 5 ||
    expectedOutcome.length > 500
  )
    go("/requests/new", "Add a clear title, scope, and expected outcome.");
  let createdRequestId = "";
  const error = await capture(async () => {
    await consumeRateLimit(member.id, "learning-request", 5, 60 * 60 * 1000);
    const skill = await getPrismaClient().skillListing.findFirst({
      where: { id: skillListingId, userId: member.id, direction: "LEARN", isActive: true },
      select: { id: true, name: true },
    });
    if (!skill) throw new InteractionError("Choose one of your active learning skills.");
    await getPrismaClient().$transaction(async (tx) => {
      const request = await tx.learningRequest.create({
        data: {
          ownerId: member.id,
          skillListingId: skill.id,
          skillName: skill.name,
          title,
          scope,
          expectedOutcome,
        },
      });
      createdRequestId = request.id;
      await tx.requestActivity.create({
        data: {
          learningRequestId: request.id,
          actorId: member.id,
          eventKey: "CREATED",
          toState: "OPEN",
          summary: "Learning request opened.",
        },
      });
    });
  });
  if (error) go("/requests/new", error);
  revalidatePath("/requests");
  revalidatePath("/member");
  go("/requests/" + createdRequestId, "Learning request posted.", "notice");
}

export async function updateLearningRequest(data: FormData) {
  const member = await requireMember();
  const id = value(data, "requestId");
  const skillListingId = value(data, "skillListingId");
  const title = value(data, "title");
  const scope = value(data, "scope");
  const expectedOutcome = value(data, "expectedOutcome");
  const error = await capture(async () => {
    const request = await getPrismaClient().learningRequest.findFirst({
      where: { id, ownerId: member.id, status: "OPEN" },
      select: { id: true, skillName: true },
    });
    if (!request) throw new InteractionError("Only your open requests can be edited.");
    const skill = await getPrismaClient().skillListing.findFirst({
      where: { id: skillListingId, userId: member.id, direction: "LEARN", isActive: true },
      select: { id: true, name: true },
    });
    if (!skill) throw new InteractionError("Choose one of your active learning skills.");
    if (
      title.length < 5 ||
      title.length > 120 ||
      scope.length < 10 ||
      scope.length > 1000 ||
      expectedOutcome.length < 5 ||
      expectedOutcome.length > 500
    )
      throw new InteractionError("Complete the title, scope, and expected outcome.");
    await getPrismaClient().$transaction([
      getPrismaClient().learningRequest.update({
        where: { id: request.id },
        data: { skillListingId: skill.id, skillName: skill.name, title, scope, expectedOutcome },
      }),
      getPrismaClient().requestActivity.create({
        data: {
          learningRequestId: request.id,
          actorId: member.id,
          eventKey: "EDITED",
          summary: "Learning request details updated.",
        },
      }),
    ]);
  });
  if (error) go("/requests", error);
  revalidatePath("/requests");
  revalidatePath("/requests/" + id);
  go("/requests/" + id, "Request updated.", "notice");
}

export async function closeLearningRequest(data: FormData) {
  const member = await requireMember();
  const id = value(data, "requestId");
  const error = await capture(async () => {
    const request = await getPrismaClient().learningRequest.findFirst({
      where: { id, ownerId: member.id, status: "OPEN" },
      select: { id: true },
    });
    if (!request) throw new InteractionError("This request is already closed or unavailable.");
    await getPrismaClient().$transaction([
      getPrismaClient().learningRequest.update({
        where: { id },
        data: { status: "CLOSED", closedAt: new Date() },
      }),
      getPrismaClient().requestActivity.create({
        data: {
          learningRequestId: id,
          actorId: member.id,
          eventKey: "CLOSED",
          fromState: "OPEN",
          toState: "CLOSED",
          summary: "Request closed by its owner.",
        },
      }),
    ]);
  });
  if (error) go("/requests/" + id, error);
  revalidatePath("/requests");
  revalidatePath("/requests/" + id);
  go("/requests/" + id, "Request closed.", "notice");
}

export async function respondToLearningRequest(data: FormData) {
  const member = await requireMember();
  const requestId = value(data, "requestId");
  const message = value(data, "message");
  const offeredSkillId = value(data, "offeredSkillId") || null;
  const visibility = value(data, "visibility") as ResponseVisibility;
  const error = await capture(async () => {
    if (message.length < 10 || message.length > 1000 || !["PUBLIC", "PRIVATE"].includes(visibility))
      throw new InteractionError("Write a response and choose public or private.");
    await consumeRateLimit(member.id, "learning-response", 10, 60 * 60 * 1000);
    const request = await getPrismaClient().learningRequest.findFirst({
      where: {
        id: requestId,
        status: "OPEN",
        owner: {
          status: "ACTIVE",
          authUser: { is: { emailVerified: true } },
          memberProfile: {
            is: {
              isDiscoverable: true,
              OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
            },
          },
        },
      },
      select: { id: true, ownerId: true, skillName: true },
    });
    if (!request || request.ownerId === member.id)
      throw new InteractionError("This learning request is not available to respond to.");
    await assertNoBlock(member.id, request.ownerId);
    const [matchingSkill, teachOffer] = await Promise.all([
      getPrismaClient().skillListing.findFirst({
        where: {
          userId: member.id,
          direction: "TEACH",
          isActive: true,
          name: { equals: request.skillName, mode: "insensitive" },
        },
        select: { id: true },
      }),
      offeredSkillId
        ? getPrismaClient().skillListing.findFirst({
            where: { id: offeredSkillId, userId: member.id, direction: "TEACH", isActive: true },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (offeredSkillId && !teachOffer)
      throw new InteractionError("Choose one of your active teaching skills.");
    if (!matchingSkill)
      throw new InteractionError(
        "Add a matching teaching skill to your profile before responding.",
      );
    const existing = await getPrismaClient().learningRequestResponse.findUnique({
      where: { requestId_responderId: { requestId, responderId: member.id } },
      select: { status: true },
    });
    if (existing?.status === "ACCEPTED")
      throw new InteractionError("This response was already accepted.");
    await getPrismaClient().$transaction(async (tx) => {
      await lockMemberPair(tx, member.id, request.ownerId);
      await assertNoBlockInTransaction(tx, member.id, request.ownerId);
      const response = await tx.learningRequestResponse.upsert({
        where: { requestId_responderId: { requestId, responderId: member.id } },
        create: {
          requestId,
          responderId: member.id,
          message,
          visibility,
          offeredSkillId: teachOffer?.id ?? null,
        },
        update: {
          message,
          visibility,
          offeredSkillId: teachOffer?.id ?? null,
          status: "PENDING",
          decidedAt: null,
        },
      });
      await tx.requestActivity.create({
        data: {
          learningRequestId: requestId,
          actorId: member.id,
          eventKey: "RESPONDED",
          toState: "PENDING",
          summary:
            visibility === "PUBLIC"
              ? "A public response was added."
              : "A private response was sent.",
        },
      });
      void response;
    });
  });
  if (error) go("/requests/" + requestId, error);
  revalidatePath("/requests/" + requestId);
  revalidatePath("/requests");
  go("/requests/" + requestId, "Your response was sent.", "notice");
}

export async function decideLearningResponse(data: FormData) {
  const member = await requireMember();
  const responseId = value(data, "responseId");
  const decision = value(data, "decision");
  const response = await getPrismaClient().learningRequestResponse.findFirst({
    where: { id: responseId, request: { ownerId: member.id, status: "OPEN" }, status: "PENDING" },
    select: { id: true, requestId: true, responderId: true },
  });
  if (!response) go("/requests", "This response is no longer available.");
  let conversationId: string | undefined;
  const error = await capture(async () => {
    await assertNoBlock(member.id, response.responderId);
    if (decision !== "ACCEPTED" && decision !== "DECLINED")
      throw new InteractionError("Choose accept or decline.");
    const responseDecision: "ACCEPTED" | "DECLINED" = decision;
    await getPrismaClient().$transaction(async (tx) => {
      await lockMemberPair(tx, member.id, response.responderId);
      await assertNoBlockInTransaction(tx, member.id, response.responderId);
      await tx.learningRequestResponse.update({
        where: { id: response.id },
        data: { status: responseDecision, decidedAt: new Date() },
      });
      await tx.requestActivity.create({
        data: {
          learningRequestId: response.requestId,
          actorId: member.id,
          eventKey: "RESPONSE_" + responseDecision,
          fromState: "PENDING",
          toState: responseDecision,
          summary: "Request owner " + responseDecision.toLowerCase() + " a response.",
        },
      });
      if (responseDecision === "ACCEPTED") {
        const linked = await createConnection(tx, member.id, response.responderId);
        conversationId = linked.conversation.id;
      }
    });
  });
  if (error) go("/requests/" + response.requestId, error);
  revalidatePath("/requests/" + response.requestId);
  revalidatePath("/connections");
  revalidatePath("/exchanges");
  if (conversationId) {
    revalidatePath("/messages/" + conversationId);
    go("/messages/" + conversationId, "Response accepted. You are connected.", "notice");
  }
  go("/requests/" + response.requestId, "Response declined.", "notice");
}

export async function withdrawLearningResponse(data: FormData) {
  const member = await requireMember();
  const responseId = value(data, "responseId");
  const response = await getPrismaClient().learningRequestResponse.findFirst({
    where: {
      id: responseId,
      responderId: member.id,
      status: "PENDING",
      request: { status: "OPEN" },
    },
    select: { id: true, requestId: true },
  });
  if (!response) go("/requests", "This response is no longer pending.");
  await getPrismaClient().$transaction([
    getPrismaClient().learningRequestResponse.update({
      where: { id: response.id },
      data: { status: "WITHDRAWN", decidedAt: new Date() },
    }),
    getPrismaClient().requestActivity.create({
      data: {
        learningRequestId: response.requestId,
        actorId: member.id,
        eventKey: "RESPONSE_WITHDRAWN",
        fromState: "PENDING",
        toState: "WITHDRAWN",
        summary: "A member withdrew their response.",
      },
    }),
  ]);
  revalidatePath("/requests/" + response.requestId);
  go("/requests/" + response.requestId, "Response withdrawn.", "notice");
}

export async function createExchangeRequest(data: FormData) {
  const member = await requireMember();
  const recipientId = value(data, "recipientId");
  const targetSkillId = value(data, "targetSkillId");
  const offerSkillId = value(data, "offerSkillId") || null;
  const type = value(data, "type") as ExchangeRequestType;
  const title = value(data, "title");
  const scope = value(data, "scope");
  const expectedOutcome = value(data, "expectedOutcome");
  const message = value(data, "message");
  const returnPath = "/exchanges";
  const createdRequest: {
    current: { id: string; recipientId: string; targetSkillName: string } | null;
  } = { current: null };
  const error = await capture(async () => {
    if (
      recipientId === member.id ||
      !["CREDIT_LEARNING", "DIRECT_SWAP"].includes(type) ||
      title.length < 5 ||
      title.length > 120 ||
      scope.length < 10 ||
      scope.length > 1000 ||
      expectedOutcome.length < 5 ||
      expectedOutcome.length > 500 ||
      message.length > 1000
    )
      throw new InteractionError("Complete all required request details.");
    await consumeRateLimit(member.id, "exchange-request", 5, 60 * 60 * 1000);
    const requesterRestrictions = await getPrismaClient().memberProfile.findUnique({
      where: { userId: member.id },
      select: { bookingRestrictedUntil: true },
    });
    if (
      requesterRestrictions?.bookingRestrictedUntil &&
      requesterRestrictions.bookingRestrictedUntil > new Date()
    )
      throw new InteractionError(
        "Your booking access is temporarily restricted after an Admin-reviewed incident.",
      );
    await assertAvailableMember(
      recipientId,
      type === "DIRECT_SWAP" ? "acceptDirectSwapRequests" : "acceptLearningRequests",
    );
    await assertNoBlock(member.id, recipientId);
    const target = await getPrismaClient().skillListing.findFirst({
      where: { id: targetSkillId, userId: recipientId, direction: "TEACH", isActive: true },
      select: { id: true, name: true, priceCredits: true },
    });
    if (!target) throw new InteractionError("Choose an active skill this member teaches.");
    const targetTeacher = await getPrismaClient().memberProfile.findUnique({
      where: { userId: recipientId },
      select: { teachingSuspendedUntil: true },
    });
    if (targetTeacher?.teachingSuspendedUntil && targetTeacher.teachingSuspendedUntil > new Date())
      throw new InteractionError(
        "This teacher’s listing is temporarily unavailable after an Admin-reviewed incident.",
      );
    let offerSkillName: string | null = null;
    let offerSkillValueCredits: number | null = null;
    if (type === "DIRECT_SWAP") {
      const [preference, targetTrust, requesterProfile] = await Promise.all([
        getPrismaClient().discoveryPreference.findUnique({
          where: { userId: member.id },
          select: { minimumDirectSwapTrust: true },
        }),
        getPrismaClient().memberProfile.findUnique({
          where: { userId: recipientId },
          select: { trustLevel: true, directSwapSuspendedUntil: true },
        }),
        getPrismaClient().memberProfile.findUnique({
          where: { userId: member.id },
          select: { directSwapSuspendedUntil: true },
        }),
      ]);
      if (
        requesterProfile?.directSwapSuspendedUntil &&
        requesterProfile.directSwapSuspendedUntil > new Date()
      ) {
        throw new InteractionError(
          "Your direct-swap access is temporarily suspended. Credit learning remains available.",
        );
      }
      if (
        targetTrust?.directSwapSuspendedUntil &&
        targetTrust.directSwapSuspendedUntil > new Date()
      ) {
        throw new InteractionError("This member's direct-swap access is temporarily suspended.");
      }
      if (targetTrust && targetTrust.trustLevel < (preference?.minimumDirectSwapTrust ?? 1)) {
        throw new InteractionError(
          "This member is below your minimum Trust Level for direct swaps.",
        );
      }
      if (!offerSkillId)
        throw new InteractionError("Choose the skill you will teach in this direct swap.");
      const offer = await getPrismaClient().skillListing.findFirst({
        where: { id: offerSkillId, userId: member.id, direction: "TEACH", isActive: true },
        select: { id: true, name: true, priceCredits: true },
      });
      if (!offer) throw new InteractionError("Choose one of your active teaching skills.");
      if (
        !target.priceCredits ||
        !offer.priceCredits ||
        target.priceCredits < 1 ||
        offer.priceCredits < 1
      ) {
        throw new InteractionError(
          "Both teaching skills need a credit value before they can be offered in a direct swap.",
        );
      }
      offerSkillName = offer.name;
      offerSkillValueCredits = offer.priceCredits;
      const [requesterWant, recipientWant] = await Promise.all([
        getPrismaClient().skillListing.findFirst({
          where: {
            userId: member.id,
            direction: "LEARN",
            isActive: true,
            name: { equals: target.name, mode: "insensitive" },
          },
          select: { id: true },
        }),
        getPrismaClient().skillListing.findFirst({
          where: {
            userId: recipientId,
            direction: "LEARN",
            isActive: true,
            name: {
              equals: offer.name,
              mode: "insensitive",
            },
          },
          select: { id: true },
        }),
      ]);
      if (!offer || !requesterWant || !recipientWant)
        throw new InteractionError(
          "Direct swaps need matching teach and learn skills in both directions.",
        );
    }
    await getPrismaClient().$transaction(async (tx) => {
      await lockMemberPair(tx, member.id, recipientId);
      await assertNoBlockInTransaction(tx, member.id, recipientId);
      const request = await tx.exchangeRequest.create({
        data: {
          requesterId: member.id,
          recipientId,
          type,
          targetSkillId,
          targetSkillName: target.name,
          offerSkillId: type === "DIRECT_SWAP" ? offerSkillId : null,
          offerSkillName,
          targetSkillValueCredits: type === "DIRECT_SWAP" ? target.priceCredits : null,
          offerSkillValueCredits: type === "DIRECT_SWAP" ? offerSkillValueCredits : null,
          title,
          scope,
          expectedOutcome,
          message: message || null,
        },
      });
      createdRequest.current = {
        id: request.id,
        recipientId: request.recipientId,
        targetSkillName: request.targetSkillName,
      };
      await tx.requestActivity.create({
        data: {
          exchangeRequestId: request.id,
          actorId: member.id,
          eventKey: "CREATED",
          toState: "PENDING",
          summary: "Exchange request sent.",
        },
      });
    });
  });
  if (error) go(returnPath, error);
  if (createdRequest.current) {
    await enqueueNotification({
      recipientId: createdRequest.current.recipientId,
      actorId: member.id,
      category: "SESSION",
      eventKey: "EXCHANGE_REQUEST_RECEIVED",
      idempotencyKey: `exchange-request:${createdRequest.current.id}:received`,
      title: "You received a skill exchange request",
      body: `${member.profile?.displayName || "A SkillSwap Member"} wants to learn ${createdRequest.current.targetSkillName}.`,
      href: "/exchanges",
    });
  }
  revalidatePath("/exchanges");
  revalidatePath("/requests");
  go("/exchanges", "Request sent.", "notice");
}

export async function decideExchangeRequest(data: FormData) {
  const member = await requireMember();
  const requestId = value(data, "requestId");
  const decision = value(data, "decision") as ExchangeRequestStatus;
  const decidedRequest: { current: { id: string; requesterId: string; title: string } | null } = {
    current: null,
  };
  const error = await capture(async () => {
    if (!["ACCEPTED", "DECLINED"].includes(decision))
      throw new InteractionError("Choose accept or decline.");
    const request = await getPrismaClient().exchangeRequest.findFirst({
      where: { id: requestId, recipientId: member.id, status: "PENDING" },
      select: {
        id: true,
        requesterId: true,
        recipientId: true,
        type: true,
        title: true,
        targetSkillValueCredits: true,
        offerSkillValueCredits: true,
      },
    });
    if (!request) throw new InteractionError("This request is no longer available.");
    decidedRequest.current = {
      id: request.id,
      requesterId: request.requesterId,
      title: request.title,
    };
    if (decision === "ACCEPTED") {
      const recipients = await getPrismaClient().memberProfile.findMany({
        where: { userId: { in: [request.requesterId, request.recipientId] } },
        select: { userId: true, teachingSuspendedUntil: true, bookingRestrictedUntil: true },
      });
      if (
        recipients.some(
          (profile) =>
            profile.userId === request.recipientId &&
            profile.teachingSuspendedUntil &&
            profile.teachingSuspendedUntil > new Date(),
        )
      )
        throw new InteractionError(
          "Your teaching access is temporarily suspended after an Admin-reviewed incident.",
        );
      if (
        recipients.some(
          (profile) =>
            profile.bookingRestrictedUntil && profile.bookingRestrictedUntil > new Date(),
        )
      )
        throw new InteractionError("A participant’s booking access is temporarily restricted.");
    }
    if (decision === "ACCEPTED" && request.type === "DIRECT_SWAP") {
      const profiles = await getPrismaClient().memberProfile.findMany({
        where: { userId: { in: [request.requesterId, request.recipientId] } },
        select: { userId: true, directSwapSuspendedUntil: true },
      });
      if (
        profiles.some(
          (profile) =>
            profile.directSwapSuspendedUntil && profile.directSwapSuspendedUntil > new Date(),
        )
      ) {
        throw new InteractionError(
          "A participant's direct-swap access is temporarily suspended. Credit learning remains available.",
        );
      }
    }
    await assertNoBlock(member.id, request.requesterId);
    await getPrismaClient().$transaction(async (tx) => {
      await lockMemberPair(tx, member.id, request.requesterId);
      await assertNoBlockInTransaction(tx, member.id, request.requesterId);
      if (decision === "ACCEPTED") {
        const restrictions = await tx.memberProfile.findMany({
          where: { userId: { in: [request.requesterId, request.recipientId] } },
          select: { userId: true, teachingSuspendedUntil: true, bookingRestrictedUntil: true },
        });
        if (
          restrictions.some(
            (profile) =>
              profile.userId === request.recipientId &&
              profile.teachingSuspendedUntil &&
              profile.teachingSuspendedUntil > new Date(),
          )
        )
          throw new InteractionError(
            "Your teaching access is temporarily suspended after an Admin-reviewed incident.",
          );
        if (
          restrictions.some(
            (profile) =>
              profile.bookingRestrictedUntil && profile.bookingRestrictedUntil > new Date(),
          )
        )
          throw new InteractionError("A participant’s booking access is temporarily restricted.");
      }
      if (decision === "ACCEPTED" && request.type === "DIRECT_SWAP") {
        const restrictions = await tx.memberProfile.findMany({
          where: { userId: { in: [request.requesterId, request.recipientId] } },
          select: { directSwapSuspendedUntil: true },
        });
        if (
          restrictions.some(
            (profile) =>
              profile.directSwapSuspendedUntil && profile.directSwapSuspendedUntil > new Date(),
          )
        ) {
          throw new InteractionError(
            "A participant's direct-swap access is temporarily suspended.",
          );
        }
      }
      await tx.exchangeRequest.update({
        where: { id: request.id },
        data: { status: decision, respondedAt: new Date() },
      });
      await tx.requestActivity.create({
        data: {
          exchangeRequestId: request.id,
          actorId: member.id,
          eventKey: decision,
          fromState: "PENDING",
          toState: decision,
          summary: "Recipient " + decision.toLowerCase() + " the request.",
        },
      });
      if (decision === "ACCEPTED") await createConnection(tx, member.id, request.requesterId);
      if (decision === "ACCEPTED" && request.type === "DIRECT_SWAP") {
        const targetValue = request.targetSkillValueCredits;
        const offerValue = request.offerSkillValueCredits;
        if (!targetValue || !offerValue || targetValue < 1 || offerValue < 1) {
          throw new InteractionError(
            "This direct-swap request has no valid credit-value snapshot.",
          );
        }
        const swap = await tx.directSwap.create({
          data: {
            exchangeRequestId: request.id,
            requesterId: request.requesterId,
            recipientId: request.recipientId,
            targetSkillValueCredits: targetValue,
            offerSkillValueCredits: offerValue,
            requesterDepositCredits: Math.ceil(targetValue / 2),
            recipientDepositCredits: Math.ceil(offerValue / 2),
          },
        });
        await tx.directSwapEvent.create({
          data: {
            directSwapId: swap.id,
            actorId: member.id,
            eventKey: "ACCEPTED",
            toState: "AWAITING_SESSIONS",
            summary: "The direct swap was accepted with both credit values and deposits recorded.",
            metadata: {
              targetSkillValueCredits: targetValue,
              offerSkillValueCredits: offerValue,
              requesterDepositCredits: Math.ceil(targetValue / 2),
              recipientDepositCredits: Math.ceil(offerValue / 2),
            },
          },
        });
      }
    });
  });
  if (error) go("/exchanges", error);
  if (decidedRequest.current) {
    await enqueueNotification({
      recipientId: decidedRequest.current.requesterId,
      actorId: member.id,
      category: "SESSION",
      eventKey: `EXCHANGE_REQUEST_${decision}`,
      idempotencyKey: `exchange-request:${decidedRequest.current.id}:${decision.toLowerCase()}`,
      title: `Your exchange request was ${decision.toLowerCase()}`,
      body: `${member.profile?.displayName || "The other Member"} ${decision.toLowerCase()} “${decidedRequest.current.title}”.`,
      href: "/exchanges",
    });
  }
  revalidatePath("/exchanges");
  revalidatePath("/connections");
  go(
    "/exchanges",
    decision === "ACCEPTED" ? "Request accepted. You are connected." : "Request declined.",
    "notice",
  );
}

export async function withdrawExchangeRequest(data: FormData) {
  const member = await requireMember();
  const requestId = value(data, "requestId");
  const error = await capture(async () => {
    const request = await getPrismaClient().exchangeRequest.findFirst({
      where: { id: requestId, requesterId: member.id, status: "PENDING" },
      select: { id: true },
    });
    if (!request) throw new InteractionError("Only your pending requests can be withdrawn.");
    await getPrismaClient().$transaction([
      getPrismaClient().exchangeRequest.update({
        where: { id: request.id },
        data: { status: "CANCELLED", respondedAt: new Date() },
      }),
      getPrismaClient().requestActivity.create({
        data: {
          exchangeRequestId: request.id,
          actorId: member.id,
          eventKey: "CANCELLED",
          fromState: "PENDING",
          toState: "CANCELLED",
          summary: "Requester withdrew the request.",
        },
      }),
    ]);
  });
  if (error) go("/exchanges", error);
  revalidatePath("/exchanges");
  go("/exchanges", "Request withdrawn.", "notice");
}
