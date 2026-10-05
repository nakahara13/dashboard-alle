CREATE TYPE "UserRole" AS ENUM ('admin', 'gestor');
CREATE TABLE "usuarios" (
  "id" SERIAL PRIMARY KEY,
  "nome" VARCHAR(255) NOT NULL CHECK (length(trim("nome")) > 0),
  "email" VARCHAR(255) NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'gestor',
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
CREATE UNIQUE INDEX "usuarios_email_normalizado_key" ON "usuarios"(lower(trim("email")));
