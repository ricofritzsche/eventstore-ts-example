import { EventFilter } from '../../eventstore';
import { IEventStore } from '../../eventstore/types';
import { TransferMoneyCommand, TransferResult } from './types';
import { processTransferCommand } from './core';
import { MoneyTransferredEvent } from './events';

export async function execute(
  eventStore: IEventStore,
  command: TransferMoneyCommand
): Promise<TransferResult> {
  const transferState = await getTransferState(eventStore, command.fromAccountId, command.toAccountId);
  
  if (!transferState.fromAccount) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'From account not found' }
    };
  }

  if (!transferState.toAccount) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'To account not found' }
    };
  }

  const effectiveCommand = {
    ...command,
    currency: command.currency || transferState.fromAccount.currency
  };

  const result = processTransferCommand(effectiveCommand, transferState.fromAccount.balance, transferState.existingTransferIds);
  
  if (!result.success) {
    return result;
  }

  try {
    const filter = EventFilter.createFilter(['MoneyTransferred'])
      .withPayloadPredicate('transferId', command.transferId);
    
    const event = new MoneyTransferredEvent(
      result.event.fromAccountId,
      result.event.toAccountId,
      result.event.amount,
      result.event.currency,
      result.event.transferId,
      result.event.timestamp
    );
    
    await eventStore.append(filter, [event]);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save transfer event' }
    };
  }
}


async function getTransferState(eventStore: IEventStore, fromAccountId: string, toAccountId: string): Promise<{
  fromAccount: { balance: number; currency: string } | null;
  toAccount: { balance: number; currency: string } | null;
  existingTransferIds: string[];
}> {
  const filter = EventFilter.createFilter(
    ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
    [
      { accountId: fromAccountId },
      { accountId: toAccountId },
      { toAccountId: fromAccountId },
      { fromAccountId: toAccountId }
    ]
  );

  const allEvents = await eventStore.query<any>(filter);
  
  const fromAccount = buildAccountState(allEvents, fromAccountId);
  const toAccount = buildAccountState(allEvents, toAccountId);
  const existingTransferIds = allEvents
    .filter(e => (e.event_type || (e.eventType && e.eventType())) === 'MoneyTransferred')
    .map(e => e.transferId);

  return {
    fromAccount,
    toAccount,
    existingTransferIds
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