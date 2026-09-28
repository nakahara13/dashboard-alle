BEGIN;

LOCK TABLE "criar_pagamento" IN ACCESS EXCLUSIVE MODE;

CREATE SEQUENCE "criar_pagamento_id_do_pagamento_seq" AS BIGINT;
ALTER SEQUENCE "criar_pagamento_id_do_pagamento_seq"
  OWNED BY "criar_pagamento"."id_do_pagamento";

-- Continue after the largest existing ID, without modifying historical rows.
SELECT setval(
  '"criar_pagamento_id_do_pagamento_seq"'::regclass,
  GREATEST(COALESCE(MAX("id_do_pagamento"), 0), 0) + 1,
  false
) FROM "criar_pagamento";

ALTER TABLE "criar_pagamento"
  ALTER COLUMN "id_do_pagamento"
  SET DEFAULT nextval('"criar_pagamento_id_do_pagamento_seq"'::regclass);

COMMIT;
