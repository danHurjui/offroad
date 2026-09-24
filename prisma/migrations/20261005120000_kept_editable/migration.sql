-- RL-042 (#54): the vehicles an owner chose to keep editable over the
-- plan's allowance. Additive and nullable: nothing chosen means the oldest
-- stay editable, exactly as before.
ALTER TABLE "Vehicle" ADD COLUMN "keptEditableAt" TIMESTAMP(3);
