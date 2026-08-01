import: tag recurring overlap by rule title too, not only by amount

The real production rules measured 2,300/month for rent, but the bank file
has a 4,600 rent row (two months paid together). Amount-only matching misses
it structurally, so the tag now fires when EITHER the amount matches OR the
rule title is contained in the row description, within the same month.

Each predicate has its own blind spot and they do not overlap:
  amount  - misses any payment that is not exactly the rule amount
  title   - misses when the bank does not name the payee (העברה מהחשבון)

Against the three real rules and all 30 bank rows the union scores 3/3 with
no false positives; amount alone scores 2/3. Over-tagging stays acceptable
because the tag never deselects a row.

Copy fix: the explanation no longer claims the match was by amount, and the
summary now states that a row without the tag may still be a duplicate.

Harness: 31/36 on cb0fec9, 36/36 here. The exact-signature dedup is
untouched: double-import still selects 0 rows on a re-import.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>