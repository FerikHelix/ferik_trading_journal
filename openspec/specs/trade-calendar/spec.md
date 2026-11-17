# trade-calendar Specification

## Purpose

Presents each trading day as one cell carrying both activity and risk consumed, so a month of trading can be read at a glance instead of reconstructed from a filtered table.

## Requirements

### Requirement: The trading day is the primary aggregation unit

The calendar SHALL aggregate positions into days using the active desk's day boundary, which is the plan's reset clock on a prop firm desk and the display timezone otherwise.

#### Scenario: Prop desk day boundary
- **WHEN** a prop desk has a plan whose reset time differs from midnight in the display timezone
- **THEN** calendar cells group its trades by the plan's reset boundary

#### Scenario: Personal desk day boundary
- **WHEN** the active desk is personal
- **THEN** calendar cells group its trades by the display timezone

### Requirement: Each cell reports trade count and realized result

A calendar cell SHALL report the number of closed trades for that day and the day's realized result in both account currency and percent of the day's opening balance.

#### Scenario: Day with trades
- **WHEN** a day contains closed trades summing to a loss
- **THEN** the cell shows the trade count, the loss amount, and that loss as a percentage of the balance at the start of the day

#### Scenario: Percentage uncomputable
- **WHEN** the day's opening balance cannot be derived
- **THEN** the cell shows the amount only and shows no percentage

### Requirement: Balance baseline excludes trading result

The opening balance for a day SHALL be derived from the account's starting balance plus preceding balance events, and SHALL NOT include that day's trading result.

#### Scenario: Deposit before a trading day
- **WHEN** a deposit occurs before a day's first trade
- **THEN** that day's opening balance includes the deposit and the day's percentage is computed against it

### Requirement: The loss budget bar appears only on prop desks

A calendar cell SHALL show the share of the plan's daily loss limit consumed when the active desk is a prop firm desk, and SHALL NOT show any budget bar on a personal desk.

#### Scenario: Prop desk cell
- **WHEN** a prop firm desk day has used part of its daily loss limit
- **THEN** the cell shows a budget bar reflecting that share

#### Scenario: Personal desk cell
- **WHEN** a personal desk day has a realized loss
- **THEN** the cell shows the loss with no budget bar

### Requirement: Empty days are distinct from flat days

A day with no closed trades SHALL be rendered as having no activity and SHALL NOT be rendered as a zero result.

#### Scenario: Weekend
- **WHEN** a day inside the displayed range has no trades
- **THEN** its cell shows no activity rather than a zero amount

### Requirement: A day can be opened to see its trades

Selecting a calendar cell SHALL reveal the positions closed on that day with their symbol, side, and result.

#### Scenario: Opening a day
- **WHEN** the user selects a cell containing three trades
- **THEN** those three positions are listed for that day

### Requirement: Months can be navigated without losing the active desk

The calendar SHALL allow moving between months and SHALL keep the active desk and its filters applied.

#### Scenario: Changing month
- **WHEN** the user moves to the previous month while a desk is active
- **THEN** the new month is shown for the same desk
