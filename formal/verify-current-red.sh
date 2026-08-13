#!/bin/zsh

set -u

quint=(npx --yes @informalsystems/quint@0.32.0)
model="formal/obails_91_parity_current.qnt"
popout_model="formal/workspace_popout_current.qnt"
failures=0

expect_red() {
  local label="$1"
  local step="$2"
  local invariant="$3"
  local seed="$4"

  "${quint[@]}" run "$model" \
    --step="$step" \
    --invariant="$invariant" \
    --max-samples=20000 \
    --max-steps=12 \
    --seed="$seed" \
    --backend=rust >"/tmp/obails-parent-${label}.log" 2>&1
  local exit_code=$?

  if [[ $exit_code -eq 1 ]]; then
    print "EXPECTED_RED $label"
  else
    print -u2 "UNEXPECTED_STATUS $label exit=$exit_code"
    failures=$((failures + 1))
  fi
}

expect_popout_red() {
  local label="$1"
  local invariant="$2"
  local seed="$3"

  "${quint[@]}" run "$popout_model" \
    --step=step \
    --invariant="$invariant" \
    --max-samples=20000 \
    --max-steps=5 \
    --seed="$seed" \
    --backend=rust >"/tmp/obails-parent-${label}.log" 2>&1
  local exit_code=$?

  if [[ $exit_code -eq 1 ]]; then
    print "EXPECTED_RED $label"
  else
    print -u2 "UNEXPECTED_STATUS $label exit=$exit_code"
    failures=$((failures + 1))
  fi
}

expect_red markdown markdownSwitchStep noSwitchEditLoss 0x0ba11008
expect_red text textSwitchStep noSwitchEditLoss 0x0ba11001
expect_red html htmlSwitchStep noSwitchEditLoss 0x0ba11009
expect_red external-modify externalStep noExternalOverwrite 0x0ba11002
expect_red external-delete externalStep noDeletedFileResurrection 0x0ba11003
expect_red external-rename externalStep noRenamedPathResurrection 0x0ba11004
expect_red link-ready linkStep linkReadsRequireReady 0x0ba11005
expect_red link-generation linkStep oneLinkSnapshotGeneration 0x0ba11006
expect_red task-stale taskStep taskReferenceTargetsSameTask 0x0ba11007
expect_red task-post-validation taskStep taskReferenceTargetsSameTask 0x0ba1100b
expect_popout_red popout-active-pane mainWindowActivePaneIsStable 0x0ba13001
expect_popout_red popout-stale-route staleChildCannotMutate 0x0ba13002

if [[ $failures -ne 0 ]]; then
  print -u2 "$failures current-model checks did not produce the required counterexample"
  exit 1
fi

print "CURRENT_RED_12_OF_12"
