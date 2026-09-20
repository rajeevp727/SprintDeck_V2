'use strict';

// Ordered by id. A migration is applied once and then never re-run, so never
// edit one that has shipped — add the next number instead.
//
// Subscriptions are not granted here: plans are handed out per person, as an
// order document in `payments` (see the grant helper in this folder).
module.exports = [];
