# prop-guardrails Specification

## Purpose

Evaluates a prop firm challenge plan against imported history so the trader can see how much of each limit is already spent, and how much of each reading is actually provable from the data at hand.

## Requirements

### Requirement: A plan captures the firm's numeric limits and reset clock

A plan SHALL store the maximum daily loss percentage, maximum total loss percentage, total loss mode, profit target percentage, minimum trading days, optional consistency percentage, the daily reset time and its timezone, and the starting balance together with the date it took effect.

#### Scenario: Plan with trailing total loss
- **WHEN** a plan is stored with the trailing total loss mode
- **THEN** the stored plan retains that mode and the guardrail reads it as trailing

#### Scenario: Plan missing a limit
- **WHEN** a plan does not specify a daily loss limit
- **THEN** the daily loss guardrail reports itself as not configured rather than as zero loss used

### Requirement: Plans are authored as markdown with a validated machine block

A plan SHALL be stored as markdown containing one fenced JSON block that carries its numeric fields. Validation SHALL occur on paste and SHALL report which fields are wrong without applying a partial plan.

#### Scenario: Invalid machine block
- **WHEN** pasted plan text contains a JSON block with a negative daily loss limit
- **THEN** the paste is rejected with the offending field named, the previous plan remains in force, and the pasted text is preserved for editing

#### Scenario: Valid machine block
- **WHEN** pasted plan text contains a well-formed block with all required fields
- **THEN** the plan is stored and its guardrails become available immediately

### Requirement: Days are bucketed by the firm's reset clock

Daily aggregation for a prop desk SHALL use the plan's reset time and timezone, not the display timezone or UTC midnight.

#### Scenario: Trade crossing the reset boundary
- **WHEN** a trade closes at a wall-clock time after the plan's reset time for a firm day
- **THEN** it is counted toward the next firm day rather than the calendar day shown in the export

### Requirement: Total loss floor reflects static or trailing mode

The total loss guardrail SHALL compute a floor from the starting balance in static mode, and from the highest reached balance in trailing mode.

#### Scenario: Static floor
- **WHEN** a static plan allows ten percent total loss on a hundred thousand starting balance
- **THEN** the reported floor is ninety thousand and does not move as the balance grows

#### Scenario: Trailing floor
- **WHEN** a trailing plan allows ten percent total loss and the balance has peaked above its starting value
- **THEN** the reported floor rises with that peak

### Requirement: Every guardrail reading carries a confidence level

Each guardrail reading SHALL be labelled as exact, estimate, or requiring attestation, and a realized-only reading SHALL NOT be presented as proof that no intraday breach occurred.

#### Scenario: Realized-only daily loss
- **WHEN** a firm day has imported trades but no recorded lowest equity
- **THEN** the daily loss reading is labelled as realized only and the product states that an intraday breach cannot be ruled out from the data

### Requirement: A recorded lowest equity refines the day's reading

A prop desk SHALL accept one optional lowest-equity value per firm day. When present, the daily loss reading SHALL account for it and its confidence SHALL increase from estimate to attested.

#### Scenario: Lowest equity recorded
- **WHEN** the user records a lowest equity below the realized closing balance for a firm day
- **THEN** the used portion of the daily loss limit is recomputed from that low and the reading is labelled as attested

#### Scenario: Lowest equity not recorded
- **WHEN** no lowest equity exists for a firm day
- **THEN** the day remains computable from realized results alone and no attestation is implied

### Requirement: Target, minimum days, and consistency are computed

The plan's profit target, minimum trading days, and consistency percentage SHALL be reported as progress against the plan, computed from bucket-by-the-reset-clock days.

#### Scenario: Target progress
- **WHEN** realized profit equals half the plan's target
- **THEN** target progress reads as half complete

#### Scenario: Consistency exceeded
- **WHEN** one firm day contributes a share of total profit above the plan's consistency cap
- **THEN** the plan reports the consistency rule as exceeded and names the day responsible

### Requirement: Rules are split into computed, soft, and attested tiers

The rule wall SHALL separate rules the system evaluates from the data, rules expressed as caps the system can count against, and rules only the trader can attest to. Attested rules SHALL be recorded as a checklist per firm day and SHALL NOT be derived from trade data.

#### Scenario: Computed limit
- **WHEN** a firm day exceeds the plan's daily loss limit
- **THEN** the rule wall reports that rule as breached without user input

#### Scenario: Attested rule
- **WHEN** a rule states that no positions are held over the weekend
- **THEN** it appears as a manual checklist item for the day and is never marked satisfied automatically

#### Scenario: Checklist state is per day
- **WHEN** the user ticks a checklist item for one firm day
- **THEN** other firm days keep their own checklist state

### Requirement: Breach status is reported even when the desk continues

The system SHALL report a firm day or plan as breached when a computed limit is exceeded, and SHALL continue to show the desk afterwards rather than hiding or deleting it.

#### Scenario: Daily limit exceeded
- **WHEN** a firm day's loss exceeds the plan's daily loss limit
- **THEN** that day is marked as breached and the remaining history stays visible and readable
