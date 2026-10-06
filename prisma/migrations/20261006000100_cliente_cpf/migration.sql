-- CPF opcional preserva os clientes existentes e a importação de três campos.
ALTER TABLE "clientes" ADD COLUMN "cpf" VARCHAR(11);
