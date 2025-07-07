import { EventFilter } from '../../eventstore';
import { IEventStore } from '../../eventstore/types';
import { WithdrawMoneyCommand, WithdrawResult } from './types';
import { processWithdrawCommand } from './core';
import { MoneyWithdrawnEvent } from './events';

export async function execute(
  eventStore: IEventStore,
  command: WithdrawMoneyCommand
): Promise<WithdrawResult> {
  const withdrawStateResult = await getWithdrawState(eventStore, command.accountId);
  
  if (!withdrawStateResult.state.account) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Account not found' }
    };
  }

  const effectiveCommand = {
    ...command,
    currency: command.currency || withdrawStateResult.state.account.currency
  };

  const result = processWithdrawCommand(effectiveCommand, withdrawStateResult.state.account.balance, withdrawStateResult.state.existingWithdrawalIds);
  
  if (!result.success) {
    return result;
  }

  try {
    // Use a filter that captures all events that affect the account balance
    // This matches the scope of events considered in getWithdrawState
    const filter = EventFilter.createFilter(
      ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
      [
        { accountId: command.accountId },
        { fromAccountId: command.accountId },
        { toAccountId: command.accountId }
      ]
    );
    
    const event = new MoneyWithdrawnEvent(
      result.event.accountId,
      result.event.amount,
      result.event.currency,
      result.event.withdrawalId,
      result.event.timestamp
    );
    
    await eventStore.append(filter, [event], withdrawStateResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save withdrawal event' }
    };
  }
}


async function getWithdrawState(eventStore: IEventStore, accountId: string): Promise<{
  state: {
    account: { balance: number; currency: string } | null;
    existingWithdrawalIds: string[];
  };
  maxSequenceNumber: number;
}> {
  const accountEventsFilter = EventFilter.createFilter(['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn'])
    .withPayloadPredicates({ accountId });
  
  const transferFromFilter = EventFilter.createFilter(['MoneyTransferred'])
    .withPayloadPredicates({ fromAccountId: accountId });
  
  const transferToFilter = EventFilter.createFilter(['MoneyTransferred'])
    .withPayloadPredicates({ toAccountId: accountId });
  
  const [accountEventsResult, transferFromEventsResult, transferToEventsResult] = await Promise.all([
    eventStore.query<any>(accountEventsFilter),
    eventStore.query<any>(transferFromFilter),
    eventStore.query<any>(transferToFilter)
  ]);
  
  const allEvents = [...accountEventsResult.events, ...transferFromEventsResult.events, ...transferToEventsResult.events];
  const account = buildAccountState(allEvents, accountId);
  const existingWithdrawalIds = accountEventsResult.events
    .filter(e => (e.event_type || (e.eventType && e.eventType())) === 'MoneyWithdrawn')
    .map(e => e.withdrawalId);

  const maxSequenceNumber = Math.max(
    accountEventsResult.maxSequenceNumber,
    transferFromEventsResult.maxSequenceNumber,
    transferToEventsResult.maxSequenceNumber
  );

  return {
    state: {
      account,
      existingWithdrawalIds
    },
    maxSequenceNumber
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