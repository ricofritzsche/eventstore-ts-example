import { EventFilter } from '../../eventstore';
import { IEventStore } from '../../eventstore';
import { GetAccountQuery, GetAccountResult, BankAccount } from './types';

export async function execute(
  eventStore: IEventStore,
  query: GetAccountQuery
): Promise<GetAccountResult> {
  const accountViewState = await getAccountViewState(eventStore, query.accountId);
  
  return accountViewState.account;
}

async function getAccountViewState(eventStore: IEventStore, accountId: string): Promise<{
  account: BankAccount | null;
}> {
  const accountEventsFilter = EventFilter.createFilter(['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn'])
    .withPayloadPredicates({ accountId });
  
  const transferFromFilter = EventFilter.createFilter(['MoneyTransferred'])
    .withPayloadPredicates({ fromAccountId: accountId });
  
  const transferToFilter = EventFilter.createFilter(['MoneyTransferred'])
    .withPayloadPredicates({ toAccountId: accountId });
  
  const [accountEvents, transferFromEvents, transferToEvents] = await Promise.all([
    eventStore.query<any>(accountEventsFilter),
    eventStore.query<any>(transferFromFilter),
    eventStore.query<any>(transferToFilter)
  ]);
  
  const allEvents = [...accountEvents, ...transferFromEvents, ...transferToEvents];
  
  const openingEvent = allEvents.find(e => 
    (e.event_type || (e.eventType && e.eventType())) === 'BankAccountOpened'
  );
  
  if (!openingEvent) {
    return { account: null };
  }

  let currentBalance = openingEvent.initialDeposit;

  for (const event of allEvents) {
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