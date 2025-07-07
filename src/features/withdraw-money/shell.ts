import { EventFilter } from '../../eventstore';
import { IEventStore } from '../../eventstore/types';
import { WithdrawMoneyCommand, WithdrawResult } from './types';
import { processWithdrawCommand } from './core';
import { MoneyWithdrawnEvent } from './events';

export async function execute(
  eventStore: IEventStore,
  command: WithdrawMoneyCommand
): Promise<WithdrawResult> {
  const withdrawState = await getWithdrawState(eventStore, command.accountId);
  
  if (!withdrawState.account) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Account not found' }
    };
  }

  const effectiveCommand = {
    ...command,
    currency: command.currency || withdrawState.account.currency
  };

  const result = processWithdrawCommand(effectiveCommand, withdrawState.account.balance, withdrawState.existingWithdrawalIds);
  
  if (!result.success) {
    return result;
  }

  try {
    const filter = EventFilter.createFilter(['MoneyWithdrawn'])
      .withPayloadPredicate('accountId', command.accountId);
    
    const event = new MoneyWithdrawnEvent(
      result.event.accountId,
      result.event.amount,
      result.event.currency,
      result.event.withdrawalId,
      result.event.timestamp
    );
    
    await eventStore.append(filter, [event]);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save withdrawal event' }
    };
  }
}


async function getWithdrawState(eventStore: IEventStore, accountId: string): Promise<{
  account: { balance: number; currency: string } | null;
  existingWithdrawalIds: string[];
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
  const account = buildAccountState(allEvents, accountId);
  const existingWithdrawalIds = accountEvents
    .filter(e => (e.event_type || (e.eventType && e.eventType())) === 'MoneyWithdrawn')
    .map(e => e.withdrawalId);

  return {
    account,
    existingWithdrawalIds
  };
}

function buildAccountState(events: any[], accountId: string): { balance: number; currency: string } | null {
  const openingEvent = events.find(e => 
    (e.event_type || (e.eventType && e.eventType())) === 'BankAccountOpened' && e.accountId === accountId
  );
  
  if (!openingEvent) {
    return null;
  }

  let currentBalance = openingEvent.initialDeposit;

  for (const event of events) {
    const eventType = event.event_type || (event.eventType && event.eventType());
    
    if (eventType === 'MoneyDeposited' && event.accountId === accountId && event.currency === openingEvent.currency) {
      currentBalance += event.amount;
    } else if (eventType === 'MoneyWithdrawn' && event.accountId === accountId && event.currency === openingEvent.currency) {
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
    balance: currentBalance,
    currency: openingEvent.currency
  };
}