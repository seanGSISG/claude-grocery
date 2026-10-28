# Everything in one place. Targets that touch the cluster run over ssh, so this
# all works from the Mac.
#
#   make                 what you can do
#   make dev             run the bot here
#   make ship            image -> cluster, in one go
#
NODE       ?= pi1.tynet.us
REMOTE_DIR ?= ~/claude-grocery-kroger-agent
NAMESPACE  ?= meal-planner
TAG        ?= 0.1.0
OP         := op run --env-file=.env.op --
REMOTE     := ssh $(NODE) 'cd $(REMOTE_DIR) && ./deploy/install.sh
KUBECTL    := ssh $(NODE) microk8s kubectl -n $(NAMESPACE)

# Local data the cluster needs. Kept here so `make seed` cannot copy the wrong file.
DB    := $(HOME)/.claude-grocery/claude-grocery.db
TOKEN := $(HOME)/.config/claude-grocery/kroger-token.json
CAL   := data/week-events.json

.DEFAULT_GOAL := help
.PHONY: help install build test typecheck check dev plan plan-prices recipes history auth smoke \
        image image-tarball sync preflight operator deploy seed ship status logs \
        restart backup chart-lint clean

help: ## This list
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	 | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  node=$(NODE)  tag=$(TAG)  namespace=$(NAMESPACE)"

# ---------------------------------------------------------------- development

install: ## npm ci (each worktree needs its own node_modules)
	npm ci

build: ## Compile TypeScript
	npm run build

test: ## Run the test suite
	npm test

typecheck: ## Typecheck the server and the tests
	npm run typecheck

check: typecheck test ## Everything that has to pass before shipping

dev: ## Run the Slack bot locally, secrets from 1Password
	$(OP) npm run slack:dev

plan: ## Print next week's plan without touching Slack
	$(OP) npm run plan:week

plan-prices: ## Same, priced against KROGER_LOCATION_ID (nothing added to the cart)
	$(OP) npm run plan:week -- --prices

recipes: ## Import the recipes in data/recipe-urls.txt
	$(OP) npm run recipes:import

history: ## Re-import purchase history (--resolve names the unnamed UPCs)
	$(OP) npm run history:import -- $(ARGS)

auth: ## Re-run the Kroger customer OAuth flow
	$(OP) npm run kroger:auth

smoke: ## Check Kroger credentials and store lookup
	$(OP) npm run kroger:smoke -- $(ARGS)

# --------------------------------------------------------------------- image

image: ## Build arm64 and push to the node's registry
	./deploy/build-image.sh $(NODE)

image-tarball: ## Build arm64 and ship over ssh instead of the registry
	./deploy/build-image.sh $(NODE) --tarball

chart-lint: ## Lint and render the chart without installing it
	helm lint deploy/charts/meal-planner
	helm template meal-planner deploy/charts/meal-planner -n $(NAMESPACE) >/dev/null && echo "renders clean"

# -------------------------------------------------------------------- cluster

sync: ## Copy deploy/ to the node
	@ssh $(NODE) 'mkdir -p $(REMOTE_DIR)/deploy'
	rsync -a --delete --exclude seed/ deploy/ $(NODE):$(REMOTE_DIR)/deploy/

preflight: sync ## Check the node (read-only) before changing anything
	$(REMOTE) preflight'

operator: sync ## Install the 1Password operator; prompts for the token on the node
	ssh -t $(NODE) 'cd $(REMOTE_DIR) && ./deploy/install.sh operator'

deploy: sync ## helm upgrade --install
	$(REMOTE) deploy'

ship: image deploy ## Build, push and roll out in one go

# Copying a database with a live WAL gives a torn copy, so the checkpoint is not
# optional and this target refuses to run while the local bot is up.
seed: ## Copy the local database and token onto the volume
	@pgrep -f "slack/start.js" >/dev/null && { echo "the local bot is running — stop it first"; exit 1; } || true
	@test -f $(DB) || { echo "no database at $(DB)"; exit 1; }
	sqlite3 $(DB) 'PRAGMA wal_checkpoint(TRUNCATE);'
	ssh $(NODE) 'mkdir -p $(REMOTE_DIR)/deploy/seed'
	scp $(DB) $(TOKEN) $(CAL) $(NODE):$(REMOTE_DIR)/deploy/seed/
	$(REMOTE) seed'

status: ## Pods, volume, secrets and recent logs
	$(REMOTE) status'

logs: ## Follow the bot's logs
	$(KUBECTL) logs -f deploy/meal-planner

restart: ## Roll the pod
	$(KUBECTL) rollout restart deploy/meal-planner
	$(KUBECTL) rollout status deploy/meal-planner

# The database is the only thing here that cannot be rebuilt, and nothing else
# backs it up. Run it before any change you are unsure about.
backup: ## Pull the live database back to ./backups
	@mkdir -p backups
	$(REMOTE) backup /tmp'
	scp $(NODE):/tmp/claude-grocery-*.db backups/
	ssh $(NODE) 'rm -f /tmp/claude-grocery-*.db'
	@ls -lh backups | tail -3

clean: ## Remove build output
	rm -rf server/dist
