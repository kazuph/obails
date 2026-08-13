#!/bin/zsh

set -u

quint=(npx --yes @informalsystems/quint@0.32.0)
model="formal/obails_91_parity_repaired.qnt"
popout_model="formal/workspace_popout_repaired.qnt"
failures=0

expect_witness() {
  local label="$1"
  local step="$2"
  local invariant="$3"
  local seed="$4"
  local itf="$5"

  "${quint[@]}" run "$model" \
    --step="$step" \
    --invariant="$invariant" \
    --max-samples=20000 \
    --max-steps=12 \
    --seed="$seed" \
    --backend=rust \
    --mbt \
    --out-itf="$itf" >"/tmp/obails-repaired-${label}.log" 2>&1
  local exit_code=$?

  if [[ $exit_code -eq 1 ]]; then
    print "EXPECTED_REACHABILITY $label"
  else
    print -u2 "UNEXPECTED_STATUS $label exit=$exit_code"
    failures=$((failures + 1))
  fi
}

expect_popout_witness() {
  local label="$1"
  local invariant="$2"
  local seed="$3"
  local itf="$4"

  "${quint[@]}" run "$popout_model" \
    --step=step \
    --invariant="$invariant" \
    --max-samples=20000 \
    --max-steps=5 \
    --seed="$seed" \
    --backend=rust \
    --mbt \
    --out-itf="$itf" >"/tmp/obails-repaired-${label}.log" 2>&1
  local exit_code=$?

  if [[ $exit_code -eq 1 ]]; then
    print "EXPECTED_REACHABILITY $label"
  else
    print -u2 "UNEXPECTED_STATUS $label exit=$exit_code"
    failures=$((failures + 1))
  fi
}

"${quint[@]}" typecheck "$model" || exit $?
"${quint[@]}" typecheck "$popout_model" || exit $?
"${quint[@]}" run "$model" --step=step --invariant=allSafety \
  --max-samples=200000 --max-steps=40 --seed=0x0ba12010 --backend=rust || exit $?
"${quint[@]}" run "$popout_model" --step=step --invariant=allSafety \
  --max-samples=100000 --max-steps=10 --seed=0x0ba13003 --backend=rust || exit $?

expect_witness markdown-flush markdownSwitchStep notMarkdownSwitchFlushReached 0x0ba12001 formal/repaired-markdown-switch-flush.itf.json
expect_witness text-flush textSwitchStep notTextSwitchFlushReached 0x0ba12002 formal/repaired-text-switch-flush.itf.json
expect_witness html-flush htmlSwitchStep notHtmlSwitchFlushReached 0x0ba12003 formal/repaired-html-switch-flush.itf.json
expect_witness external-fresh-commit externalStep notFreshExternalCommitReached 0x0ba12004 formal/repaired-external-fresh-commit.itf.json
expect_witness external-modify-rejected externalStep notModifiedConflictReached 0x0ba12005 formal/repaired-external-modify-conflict.itf.json
expect_witness external-delete-rejected externalStep notDeletedConflictReached 0x0ba12006 formal/repaired-external-delete-conflict.itf.json
expect_witness external-rename-rejected externalStep notRenamedConflictReached 0x0ba12007 formal/repaired-external-rename-conflict.itf.json
expect_witness readiness-guard linkStep notReadinessGuardReached 0x0ba12008 formal/repaired-link-readiness-guard.itf.json
expect_witness pinned-generation linkStep notPinnedRebuildReached 0x0ba12009 formal/repaired-link-pinned-generation.itf.json
expect_witness fresh-task taskStep notFreshTaskUpdateReached 0x0ba1200a formal/repaired-task-fresh-update.itf.json
expect_witness stale-task taskStep notStaleTaskRejectionReached 0x0ba1200b formal/repaired-task-stale-rejected.itf.json
expect_witness post-validation-task taskStep notPostValidationTaskRejectionReached 0x0ba1200c formal/repaired-post-validation-task-rejected.itf.json
expect_witness workspace-restore-close workspaceStep notWorkspaceRestoreCloseReached 0x0ba1200d formal/repaired-workspace-restore-close.itf.json
expect_witness workspace-rejoin workspaceStep notWorkspaceRejoinReached 0x0ba1200e formal/repaired-workspace-rejoin.itf.json
expect_popout_witness popout-live-route notLiveRouteMutationReached 0x0ba13004 formal/repaired-popout-live-route.itf.json
expect_popout_witness popout-stale-rejected notStaleRejectionReached 0x0ba13005 formal/repaired-popout-stale-rejected.itf.json

if [[ $failures -ne 0 ]]; then
  print -u2 "$failures repaired-model reachability checks did not produce the required witness"
  exit 1
fi

print "REPAIRED_GREEN_AND_REACHABLE_16_OF_16"
