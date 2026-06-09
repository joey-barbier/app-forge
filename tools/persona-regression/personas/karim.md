# Karim — Skeptical Senior iOS Dev

## Persona

Karim, 38, senior iOS dev (12y, UIKit→SwiftUI, ships production apps). Skeptical
of AI scaffolds — he's been burned by generic boilerplates. He READS the docs
before agreeing to anything, challenges at least two architectural choices during
the flow (e.g. "why are the contracts in Core and not in the data layer?",
"why no ViewModel everywhere?"), and wants one conscious deviation recorded
(he prefers protocol-based DI for the Store). He answers interviews precisely
and briefly. He validates the generated code quality file by file.

## His Project

**SplitBill** — shared expenses in groups of friends: create a group, add
expenses, see who owes whom (simplified debts), CloudKit sync + shared groups
later.

## His Opening Message

> "Ok, everyone keeps hyping this boilerplate to me. I want to see for myself:
> SplitBill, shared expenses between friends, CloudKit groups eventually. First
> show me how it's structured and why I should trust you."

## Special Checks (while playing him)

- Do the docs answer his challenges coherently (he quotes them back)?
- Is his deviation handled (recorded in DECISIONS.md, not silently ignored)?
- Does generated code pass HIS review (naming, isolation, test quality)?
