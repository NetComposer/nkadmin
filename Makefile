APP = nkadmin
REBAR = rebar3

.PHONY: rel stagedevrel package version all tree shell

all: compile


version:
	@echo "$(shell git symbolic-ref HEAD 2> /dev/null | cut -b 12-)-$(shell git log --pretty=format:'%h, %ad' -1)" > $(APP).version


version_header: version
	@echo "-define(VERSION, <<\"$(shell cat $(APP).version)\">>)." > include/$(APP)_version.hrl

clean:
	$(REBAR) clean


rel:
	$(REBAR) release


compile:
	$(REBAR) compile


dialyzer:
	$(REBAR) dialyzer


xref:
	$(REBAR) xref


upgrade:
	$(REBAR) upgrade
	make tree


update:
	$(REBAR) update


tree:
	$(REBAR) tree | grep -v '=' | sed 's/ (.*//' > tree


tree-diff: tree
	git diff test -- tree


docs:
	$(REBAR) edoc
