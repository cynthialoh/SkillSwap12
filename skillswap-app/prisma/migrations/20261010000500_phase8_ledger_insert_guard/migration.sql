-- Entry rows may only be added in the same database transaction that creates
-- their parent ledger transaction. This prevents back-dating entries onto a
-- previously committed posting while still allowing Prisma's nested create.
CREATE FUNCTION "guard_credit_ledger_entry_insert"() RETURNS trigger AS $$
DECLARE
  parent_created_at TIMESTAMP(3);
BEGIN
  SELECT "createdAt" INTO parent_created_at
    FROM "CreditLedgerTransaction"
   WHERE "id" = NEW."transactionId";
  IF parent_created_at IS NULL OR parent_created_at <> transaction_timestamp()::TIMESTAMP(3) THEN
    RAISE EXCEPTION 'Credit ledger entries must be created with their parent transaction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CreditLedgerEntry_insert_guard"
BEFORE INSERT ON "CreditLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION "guard_credit_ledger_entry_insert"();
