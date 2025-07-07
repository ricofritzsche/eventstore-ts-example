# Aggregateless Event Store with TypeScript and PostgreSQL

A minimal TypeScript implementation of an aggregateless event sourcing system with PostgreSQL persistence. This approach eliminates DDD aggregates in favor of independent feature slices that rebuild minimal state on-demand from events. In general, we get rid of central, shared states and OO-paradigms.

This is a practical implementation of the concepts described in [Aggregateless Event Sourcing](https://ricofritzsche.me/p/ec16995f-c69d-4946-83c7-efdf98835585/?member_status=free).

## Core Philosophy

The **aggregateless approach** means no large shared object clusters in memory. Instead:

- **Events as the only shared resource** - A single events table serves all features
- **Independent feature slices** - Each feature queries events specific to its context  
- **Pure decision functions** - Business logic separated from I/O operations
- **Optimistic locking via CTE** - Consistency without version numbers or row locks
- **Minimal state reconstruction** - Load only what's needed for the current decision

## Key Features

### Functional Core Pattern
Business logic is implemented as pure functions that are easy to test and reason about:

```typescript
// Pure functions - no side effects
function processOpenAccountCommand(
  command: OpenBankAccountCommand,
  accountId: string,
  existingCustomerNames?: string[]
): OpenAccountResult {
  const commandWithDefaults = {
    ...command,
    accountType: command.accountType || 'checking',
    currency: command.currency || 'USD'
  };
  
  const validationError = validateOpenAccountCommand(commandWithDefaults);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // Check for unique customer name
  if (existingCustomerNames && existingCustomerNames.includes(commandWithDefaults.customerName.trim())) {
    return { 
      success: false, 
      error: { type: 'InvalidCustomerName', message: 'Customer name already exists' } 
    };
  }

  const event: BankAccountOpenedEvent = {
    type: 'BankAccountOpened',
    accountId,
    customerName: commandWithDefaults.customerName,
    accountType: commandWithDefaults.accountType,
    initialDeposit: commandWithDefaults.initialDeposit || 0,
    currency: commandWithDefaults.currency,
    openedAt: new Date()
  };

  return { success: true, event };
}
```

### Optimistic Locking
Ensures consistency without traditional database locks by validating context hasn't changed:

```typescript
// Query with specific context
const filter = EventFilter
  .createFilter(['BankAccountOpened'])
  .withPayloadPredicate('accountId', accountId);

const depositState = await getDepositState(eventStore, command.accountId);
const result = processDepositCommand(command, depositState.existingDepositIds);

// Append with same filter - fails if context changed
await store.append(filter, newEvents);
```

### Payload-Based Querying
Efficient event filtering using PostgreSQL JSONB containment operators with OR conditions:

```typescript
// Unified query with multiple payload predicates (OR logic)
const filter = EventFilter.createFilter(
  ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
  [
    { accountId: fromAccountId },      // Account events for source
    { accountId: toAccountId },        // Account events for target
    { toAccountId: fromAccountId },    // Transfers to source
    { fromAccountId: toAccountId },    // Transfers from target
  ]
);
const events = await eventStore.query<any>(filter);

// Generates SQL: WHERE event_type = ANY($1) AND (payload @> $2 OR payload @> $3 OR ...)
```

## Architecture

### Core Interfaces

```typescript
// Events must implement this interface
interface HasEventType {
  eventType(): string;
  eventVersion?(): string;
}

// Main EventStore interface  
interface IEventStore {
  query<T extends HasEventType>(filter: EventFilter): Promise<T[]>;
  append<T extends HasEventType>(filter: EventFilter, events: T[]): Promise<void>;
  close(): Promise<void>;
}
```

### PostgreSQL Schema

```sql
CREATE TABLE events (
  sequence_number BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Optimized indexes for querying
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_occurred_at ON events(occurred_at);
CREATE INDEX idx_events_payload_gin ON events USING gin(payload);
```

### Optimistic Locking Implementation

The append operation uses a CTE (Common Table Expression) to ensure atomicity and prevent race conditions:

```sql
WITH context AS (
  SELECT MAX(sequence_number) AS max_seq
  FROM events 
  WHERE event_type = ANY($1) AND payload @> $2
)
INSERT INTO events (event_type, payload, metadata)
SELECT unnest($4::text[]), unnest($5::jsonb[]), unnest($6::jsonb[])
FROM context
WHERE COALESCE(max_seq, 0) = $3
```

This ensures that:
- Context validation and event insertion happen atomically
- No events can be inserted if the context has changed
- Multiple events can be inserted efficiently in a single operation
- Race conditions between concurrent operations are prevented

## Getting Started

### Installation

```bash
npm install
```

### Database Setup

1. **Start PostgreSQL** (Docker example):
```bash
docker run --name eventstore-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p 5432:5432 -d postgres:15
```

2. **Create .env file**:
```bash
echo "DATABASE_URL=postgres://postgres:postgres@localhost:5432/bank" > .env
```

The system will automatically create the `bank` database if it does not exist.

### Build the Project

```bash
npm run build
```

### Basic Usage

```typescript
import { EventStore, EventFilter, HasEventType } from './src/eventstore';

// 1. Define your events
class BankAccountOpenedEvent implements HasEventType {
  constructor(
    public readonly accountId: string,
    public readonly customerName: string,
    public readonly accountType: string,
    public readonly initialDeposit: number,
    public readonly currency: string,
    public readonly openedAt: Date = new Date()
  ) {}

  eventType(): string {
    return 'BankAccountOpened';
  }
}

// 2. Create EventStore and migrate
const store = new EventStore();
await store.migrate();

// 3. Store events with context
const filter = EventFilter
  .createFilter(['BankAccountOpened'])
  .withPayloadPredicate('accountId', accountId);

const events = [new BankAccountOpenedEvent(accountId, 'John Doe', 'checking', 100, 'USD')];
await store.append(filter, events);

// 4. Query events
const storedEvents = await store.query<BankAccountOpenedEvent>(filter);
```

## Features

### Banking Domain Implementation

The system includes five feature slices following Single Responsibility Principle:

- **open-bank-account**: Creates new bank accounts with unique customer name validation
- **deposit-money**: Handles money deposits with currency auto-detection
- **withdraw-money**: Processes withdrawals with balance validation
- **transfer-money**: Manages money transfers between accounts
- **get-account**: Retrieves account information (note: for demonstration only - production should use read models)

Each feature:
- Uses single query pattern for efficient state building
- Follows functional core/imperative shell architecture
- Maintains complete independence from other features
- Rebuilds state from events for decision making

### Running the Banking Example

#### Interactive CLI
```bash
npm run cli
```

This provides an interactive banking system where you can:
- Open bank accounts with auto-generated UUIDs and unique customer names
- Deposit money to accounts
- Withdraw money from accounts
- Transfer money between accounts
- View account balances

#### Unique Customer Name Test
```bash
node test-unique-customer.js
```

This tests the unique customer name validation feature.

#### End-to-End Test
```bash
node test-all-operations.js
```

This demonstrates:
- Account creation with UUID generation and unique customer name validation
- Money deposits with automatic currency detection
- Money withdrawals with balance validation
- Money transfers between accounts
- Insufficient funds error handling
- Balance reconstruction from events
- Single query pattern for efficient state building

## Usage Patterns

### 1. Command Handler Pattern

```typescript
export async function execute(
  eventStore: IEventStore,
  command: DepositMoneyCommand
): Promise<DepositResult> {
  // Single query to build complete state
  const depositState = await getDepositState(eventStore, command.accountId);
  
  if (!depositState.account) {
    return {
      success: false,
      error: { type: 'InvalidAmount', message: 'Account not found' }
    };
  }

  // Use account's currency if not specified
  const effectiveCommand = {
    ...command,
    currency: command.currency || depositState.account.currency
  };

  // Pure business logic with complete state
  const result = processDepositCommand(effectiveCommand, depositState.existingDepositIds);
  if (!result.success) {
    return result;
  }

  // Persist with optimistic locking
  try {
    const filter = EventFilter.createFilter(['MoneyDeposited'])
      .withPayloadPredicate('accountId', command.accountId);
    
    const event = new MoneyDepositedEvent(
      result.event.accountId,
      result.event.amount,
      result.event.currency,
      result.event.depositId,
      result.event.timestamp
    );
    
    await eventStore.append(filter, [event]);
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InvalidAmount', message: 'Failed to save deposit event' }
    };
  }
}
```

### 2. Event Projections

```typescript
// Build account state from events with single query
async function getAccountViewState(eventStore: IEventStore, accountId: string): Promise<{
  account: BankAccount | null;
}> {
  // Single comprehensive query
  const filter = EventFilter.createFilter(['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred']);
  const allEvents = await eventStore.query<any>(filter);
  
  // Filter for relevant events in memory
  const relevantEvents = allEvents.filter(event => {
    const eventType = event.event_type || (event.eventType && event.eventType());
    return (
      (eventType === 'BankAccountOpened' && event.accountId === accountId) ||
      (eventType === 'MoneyDeposited' && event.accountId === accountId) ||
      (eventType === 'MoneyWithdrawn' && event.accountId === accountId) ||
      (eventType === 'MoneyTransferred' && (event.fromAccountId === accountId || event.toAccountId === accountId))
    );
  });
  
  const openingEvent = relevantEvents.find(e => 
    (e.event_type || (e.eventType && e.eventType())) === 'BankAccountOpened'
  );
  
  if (!openingEvent) {
    return { account: null };
  }

  // Calculate current balance by folding events
  let currentBalance = openingEvent.initialDeposit;

  for (const event of relevantEvents) {
    const eventType = event.event_type || (event.eventType && event.eventType());
    
    if (eventType === 'MoneyDeposited' && event.currency === openingEvent.currency) {
      currentBalance += event.amount;
    } else if (eventType === 'MoneyWithdrawn' && event.currency === openingEvent.currency) {
      currentBalance -= event.amount;
    } else if (eventType === 'MoneyTransferred' && event.currency === openingEvent.currency) {
      if (event.fromAccountId === accountId) {
        currentBalance -= event.amount;
      } else if (event.toAccountId === accountId) {
        currentBalance += event.amount;
      }
    }
  }

  return {
    account: {
      accountId: openingEvent.accountId,
      customerName: openingEvent.customerName,
      accountType: openingEvent.accountType,
      balance: currentBalance,
      currency: openingEvent.currency,
      openedAt: openingEvent.openedAt
    }
  };
}
```

## Testing Strategy

### Unit Tests (Pure Functions)
```typescript
describe('Deposit Money Logic', () => {
  it('should allow deposit to existing account', () => {
    const account = { accountId: 'acc-1', balance: 100, currency: 'USD' };
    const command = { accountId: 'acc-1', amount: 50, depositId: 'dep-1' };
    
    const result = processDepositCommand(command, account);
    
    expect(result.success).toBe(true);
    expect(result.event.amount).toBe(50);
  });

  it('should reject negative amounts', () => {
    const account = { accountId: 'acc-1', balance: 100, currency: 'USD' };
    const command = { accountId: 'acc-1', amount: -50, depositId: 'dep-1' };
    
    const result = processDepositCommand(command, account);
    
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('InvalidAmount');
  });
});
```

### Integration Tests
```typescript
describe('Banking System Integration', () => {
  it('should handle complete account lifecycle', async () => {
    const store = new EventStore();
    await store.migrate();
    
    // Open account
    const openResult = await OpenBankAccount.execute(store, {
      customerName: 'Alice',
      accountType: 'checking',
      initialDeposit: 500,
      currency: 'EUR'
    });
    
    const accountId = openResult.event.accountId;
    
    // Deposit money
    await DepositMoney.execute(store, {
      accountId,
      amount: 200,
      depositId: 'deposit-1'
    });
    
    // Withdraw money
    await WithdrawMoney.execute(store, {
      accountId,
      amount: 150,
      withdrawalId: 'withdrawal-1'
    });
    
    // Check final balance
    const account = await GetAccount.execute(store, { accountId });
    expect(account.balance).toBe(550); // 500 + 200 - 150
  });
});
```

## Configuration

### Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- Default: `"postgres://postgres:postgres@localhost:5432/bank"`

### TypeScript Configuration

Requires `exactOptionalPropertyTypes: true` for proper type safety with optional properties.

## Performance Considerations

- **Indexing**: JSONB GIN indexes enable fast payload queries
- **Batching**: Use bulk operations for high-throughput scenarios
- **Partitioning**: Consider table partitioning for very large event stores
- **Connection Pooling**: Uses pg connection pooling by default

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details