-- Two levels where there was one: a group, and a category inside it.
--
-- WHY THE FLAT LIST RAN OUT. The nine categories in 20260903050000 were chosen
-- for what they are NOT — none of them can be a RECURRING commitment — and that
-- test is still the right one. What they were never chosen for is reading. Nine
-- rows sorted by size answer "what was biggest"; they cannot answer "is food up
-- or is it just that I drove more", because TRANSPORT held Grab, tolls and
-- parking in one bucket and SHOPPING held a shirt, a kettle and a phone case.
-- A group layer costs nothing at the point of entry — the form still asks one
-- question — and it is what lets a month be compared against the three before
-- it at a level where the comparison means something.
--
-- THE GROUP IS NOT A COLUMN. It is a function of the category and it never
-- varies, so storing it would create a second place for one fact to be wrong.
-- The mapping lives beside the category list in src/services/expenses.service.js
-- and web/src/lib/calc.js, the same way the list itself already does.
--
-- SCOPE IS UNCHANGED. Still unpredictable spending only. There is no Housing,
-- Insurance or Subscriptions group and there must never be one: those are known
-- in advance, they are RECURRING commitments, and entering them here as well
-- would count them twice against income.

-- migrate:up

-- Off first, or the backfill cannot move a row through it.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

-- Every old value lands on a leaf. Two are exact; the rest are the majority
-- reading of a bucket that held more than one thing, and are named here so a
-- surprising total can be traced back to this line rather than guessed at.
--
--   EATING_OUT  -> MEALS_OUT      (Coffee & snacks now splits off, going forward)
--   TRANSPORT   -> FARES          ("Grab, tolls, parking, public transport" —
--                                  fares were the bulk; tolls and parking split off)
--   HEALTH      -> MEDICAL        ("clinic, pharmacy, dental" — pharmacy splits off)
--   SHOPPING    -> THINGS         ("clothes, household, anything bought once" —
--                                  THINGS is the catch-all of the three it becomes)
--   FAMILY      -> RELATIVES      Money given to parents or relatives. NOT Kids or
--                                 Pets: the old column meant support sent home, and
--                                 filing that under Gifts would lose a real flow.
--                                 RELATIVES is a third leaf under Family for it.
--   CHARITY     -> DONATIONS      sedekah and donations, under Giving
--   OTHER       -> UNCATEGORISED
--   GROCERIES, FUEL                unchanged
UPDATE expenses SET category = CASE category
  WHEN 'EATING_OUT' THEN 'MEALS_OUT'
  WHEN 'TRANSPORT'  THEN 'FARES'
  WHEN 'HEALTH'     THEN 'MEDICAL'
  WHEN 'SHOPPING'   THEN 'THINGS'
  WHEN 'FAMILY'     THEN 'RELATIVES'
  WHEN 'CHARITY'    THEN 'DONATIONS'
  WHEN 'OTHER'      THEN 'UNCATEGORISED'
  ELSE category
END
WHERE category IN ('EATING_OUT','TRANSPORT','HEALTH','SHOPPING','FAMILY','CHARITY','OTHER');

-- The leaves, in group order. Still a fixed list rather than free text, for the
-- reason the first migration gave: free text fragments on typos and every total
-- is quietly wrong. Longer than nine, but the form groups them, so the choice at
-- the point of entry is still one glance rather than a scroll.
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    -- Food
    'GROCERIES', 'MEALS_OUT', 'COFFEE_SNACKS',
    -- Transport
    'FUEL', 'FARES', 'PARKING_TOLLS',
    -- Home
    'HOUSEHOLD_GOODS', 'HOME_UPKEEP',
    -- Health
    'MEDICAL', 'PHARMACY',
    -- Personal care
    'GROOMING', 'TOILETRIES',
    -- Shopping
    'CLOTHES', 'THINGS',
    -- Entertainment
    'GOING_OUT', 'GAMES_MEDIA',
    -- Travel
    'FLIGHTS_STAYS', 'TRIP_SPENDING',
    -- Family
    'RELATIVES', 'KIDS', 'PETS',
    -- Giving
    'GIFTS', 'DONATIONS',
    -- Learning
    'COURSES', 'BOOKS',
    -- Fees
    'BANK_FEES', 'CARD_CHARGES',
    -- Other
    'UNCATEGORISED'
  ));

-- migrate:down

-- LOSSY, AND ONLY IN ONE DIRECTION. Rolling back folds the leaves back into the
-- nine, so Coffee & snacks and Meals out both become EATING_OUT and cannot be
-- told apart again. Rolling forward afterwards would then file every coffee as
-- a meal. That is the cost of the narrower buckets and it is worth naming here.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

UPDATE expenses SET category = CASE category
  WHEN 'MEALS_OUT'       THEN 'EATING_OUT'
  WHEN 'COFFEE_SNACKS'   THEN 'EATING_OUT'
  WHEN 'FARES'           THEN 'TRANSPORT'
  WHEN 'PARKING_TOLLS'   THEN 'TRANSPORT'
  WHEN 'HOUSEHOLD_GOODS' THEN 'SHOPPING'
  WHEN 'HOME_UPKEEP'     THEN 'SHOPPING'
  WHEN 'MEDICAL'         THEN 'HEALTH'
  WHEN 'PHARMACY'        THEN 'HEALTH'
  WHEN 'GROOMING'        THEN 'SHOPPING'
  WHEN 'TOILETRIES'      THEN 'SHOPPING'
  WHEN 'CLOTHES'         THEN 'SHOPPING'
  WHEN 'THINGS'          THEN 'SHOPPING'
  WHEN 'GOING_OUT'       THEN 'OTHER'
  WHEN 'GAMES_MEDIA'     THEN 'OTHER'
  WHEN 'FLIGHTS_STAYS'   THEN 'OTHER'
  WHEN 'TRIP_SPENDING'   THEN 'OTHER'
  WHEN 'RELATIVES'       THEN 'FAMILY'
  WHEN 'KIDS'            THEN 'FAMILY'
  WHEN 'PETS'            THEN 'FAMILY'
  WHEN 'GIFTS'           THEN 'CHARITY'
  WHEN 'DONATIONS'       THEN 'CHARITY'
  WHEN 'COURSES'         THEN 'OTHER'
  WHEN 'BOOKS'           THEN 'OTHER'
  WHEN 'BANK_FEES'       THEN 'OTHER'
  WHEN 'CARD_CHARGES'    THEN 'OTHER'
  WHEN 'UNCATEGORISED'   THEN 'OTHER'
  ELSE category
END;

ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN (
    'GROCERIES', 'EATING_OUT', 'TRANSPORT', 'FUEL',
    'HEALTH', 'SHOPPING', 'FAMILY', 'CHARITY', 'OTHER'
  ));
