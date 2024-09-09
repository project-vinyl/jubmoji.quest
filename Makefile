all: install-dependencies start-db start

.PHONY: install-dependencies
install-dependencies:
	yarn install

.PHONY: start-db
start-db:
	docker compose up -d

.PHONY: stop-db
stop-db:
	docker compose stop

.PHONY: drop-db
drop-db:
	docker compose down

.PHONY: init-db
init-db:
	cd apps/jubmoji-quest && npx prisma migrate dev --name init

.PHONY: generate-orm
generate-orm:
	cd apps/jubmoji-quest && npx prisma generate

.PHONY: start
start:
	cd packages/jubmoji-api && yarn run build && cd ../../apps/jubmoji-quest && yarn dev