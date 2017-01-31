
COUCH_URL ?= http://admin:secret@localhost:5984
CURLJZ = curl -sfS --compressed -H 'content-type:application/json'

.PHONY: init

all: bulk-update

init:
	test -d tmp || mkdir tmp

tmp/rows.json: init
	node temp-query.js | \
	  ${CURLJZ} -d@- "${COUCH_URL}/medic/_temp_view?include_docs=true" > \
	  tmp/rows.json

tmp/updated-docs.json: tmp/rows.json
	cat tmp/rows.json | ./add-uuid-to-scheduled-tasks > tmp/updated-docs.json

bulk-update: tmp/updated-docs.json
	cat tmp/updated-docs.json | ${CURLJZ} -d@- "${COUCH_URL}/medic/_bulk_docs"

clean: 
	test ! -d tmp || rm tmp/*
