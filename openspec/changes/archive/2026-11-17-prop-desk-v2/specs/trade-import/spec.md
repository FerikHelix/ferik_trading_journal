# Spec Delta

## Purpose

Turns a broker export into positions on the correct desk without asking the user to describe their account, and without duplicating history when exports overlap.

## ADDED Requirements

### Requirement: The file format is determined by content

Import SHALL identify the source format by inspecting file content rather than by file extension or user choice. Supported sources are Exness CSV, MT5 workbook, and MT5 CSV.

#### Scenario: Workbook with a misleading extension
- **WHEN** a valid MT5 workbook is supplied with a `.csv` extension
- **THEN** it is still recognised as a workbook and imported

#### Scenario: Unsupported content
- **WHEN** the content matches no supported source
- **THEN** the import is refused with a message naming the supported sources and nothing is written to storage

### Requirement: The destination desk is resolved without user input

When the export contains account identity, import SHALL resolve the destination desk itself and SHALL NOT ask for label, server, currency, or timezone.

#### Scenario: Known account number
- **WHEN** the export carries an account number already stored
- **THEN** the history lands on that desk with no prompts

#### Scenario: Unknown account number
- **WHEN** the export carries an account number that is not yet stored
- **THEN** a desk is created from the export's own metadata as a personal desk and the history lands on it with no prompts

### Requirement: Accounts are matched by account number alone

Account resolution SHALL compare account numbers and SHALL ignore broker or server labels, so a renamed server string does not produce a second desk for the same account.

#### Scenario: Server string differs between exports
- **WHEN** two exports share an account number but carry different server labels
- **THEN** both resolve to the same desk and only one desk exists for that number

### Requirement: Re-importing overlapping history is idempotent

Import SHALL insert only records not already stored for the destination desk, and SHALL recognise a file that was already imported.

#### Scenario: Overlapping export
- **WHEN** an export containing previously imported trades plus new trades is committed
- **THEN** only the new trades are inserted and the overlap is reported as duplicates

#### Scenario: Identical file twice
- **WHEN** the same file is committed a second time
- **THEN** the result reports that the file was already imported and no records are duplicated

### Requirement: Import commits atomically

An import SHALL commit as a single transaction. If any part fails, no trades, positions, batches, or desk records from that attempt SHALL remain.

#### Scenario: Failure during commit
- **WHEN** an error occurs partway through committing an import
- **THEN** the stored data is left exactly as it was before the attempt and the user is told the import failed

### Requirement: Import is a single action

Committing an export SHALL require one user action after selecting the file, with no multi-step confirmation flow.

#### Scenario: End-of-session import
- **WHEN** the user drops an export on the import surface
- **THEN** the result of the import is shown without an intermediate review-and-confirm step

### Requirement: All processing is local

Import SHALL read and process files entirely in the browser and SHALL NOT transmit file contents or derived data over the network.

#### Scenario: Import while offline
- **WHEN** the device has no network connection
- **THEN** import completes normally
