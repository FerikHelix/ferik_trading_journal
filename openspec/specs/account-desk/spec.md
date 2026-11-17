# account-desk Specification

## Purpose

Distinguishes a personal trading desk from a prop firm desk and holds the account facts, starting balance and opening date, that every percentage and guardrail in the product is computed from.

## Requirements

### Requirement: Every account declares a desk kind

Each account SHALL carry a desk kind of either `personal` or `propfirm`. The kind is chosen when the account is created and is never inferred from the broker, server name, or file format.

#### Scenario: Creating a personal desk
- **WHEN** the user creates an account and selects the personal kind
- **THEN** the account is stored as personal and no plan fields are offered anywhere in the product

#### Scenario: Creating a prop firm desk
- **WHEN** the user creates an account and selects the prop firm kind
- **THEN** the account is stored as a prop firm desk and is offered a challenge plan

### Requirement: Accounts record a starting balance and opening date

Each account SHALL store a starting balance in its own currency and the date the balance took effect. Monetary percentages SHALL be derived from this balance plus the balance events that precede the day being described.

#### Scenario: Percentage available
- **WHEN** an account has a starting balance and a day's realized loss
- **THEN** the day's loss is expressible as a percentage of that day's opening balance

#### Scenario: Starting balance absent
- **WHEN** an account has no starting balance recorded
- **THEN** percentage-based readings are reported as unavailable and are never rendered as zero percent

### Requirement: A plan belongs only to a prop firm desk

The system SHALL reject attaching a challenge plan to a personal desk, and SHALL refuse to change a desk that has a plan into a personal desk until that plan is detached.

#### Scenario: Plan attached to a personal desk
- **WHEN** a plan is attached to an account whose kind is personal
- **THEN** the change is rejected and the account keeps no plan

#### Scenario: Desk kind downgraded while a plan exists
- **WHEN** the user changes a prop firm desk with an attached plan to the personal kind
- **THEN** the change is refused and the user is told the plan must be detached first

### Requirement: Editing account facts re-derives but never rewrites history

Changing a starting balance, opening date, or desk kind SHALL recompute derived readings and SHALL NOT modify imported trades, positions, or balance events.

#### Scenario: Starting balance corrected after import
- **WHEN** the user corrects an account's starting balance after importing history
- **THEN** percentages and guardrail bars are recomputed from the new balance and every imported trade remains unchanged

### Requirement: The active desk is a persistent selection

The active desk SHALL persist across navigation and reloads, and an invalid stored selection SHALL fall back to a defined state rather than an empty screen.

#### Scenario: Stored desk no longer exists
- **WHEN** the stored active desk id is not among the existing accounts
- **THEN** the selection falls back to the all-desks state and the product renders normally

#### Scenario: Selection survives navigation
- **WHEN** the user selects a desk and moves between pages
- **THEN** the same desk remains selected on the next page

### Requirement: Prop-only surfaces are absent on personal desks

Navigation entries and panels that exist only for prop firms SHALL not be rendered for personal desks, rather than rendered disabled.

#### Scenario: Personal desk navigation
- **WHEN** the active desk is personal
- **THEN** the plan destination and every guardrail panel are absent from navigation and page content
