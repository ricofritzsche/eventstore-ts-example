import { EventFilter } from '../../eventstore';
import { IEventStore } from '../../eventstore';
import { DepositMoneyCommand, DepositResult } from './types';
import { processDepositCommand } from './core';
import { MoneyDepositedEvent } from './events';

export async function execute(
  eventStore: IEventStore,
  command: DepositMoneyCommand
): Promise<DepositResult> {
  const depositState = await getDepositState(eventStore, command.accountId);
  
  if (!depositState.account) {
    return {
      success: false,
      error: { type: 'InvalidAmount', message: 'Account not found' }
    };
  }

  const effectiveCommand = {
    ...command,
    currency: command.currency || depositState.account.currency
  };

  const result = processDepositCommand(effectiveCommand, depositState.existingDepositIds);
  
  if (!result.success) {
    return result;
  }

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

async function getDepositState(eventStore: IEventStore, accountId: string): Promise<{
  account: { currency: string } | null;
  existingDepositIds: string[];
}> {
  const filter = EventFilter.createFilter(['BankAccountOpened', 'MoneyDeposited'])
    .withPayloadPredicates({ accountId });
  
  const events = await eventStore.query<any>(filter);
  
  const openingEvent = events.find(e => 
    (e.event_type || (e.eventType && e.eventType())) === 'BankAccountOpened'
  );
  
  const account = openingEvent ? { currency: openingEvent.currency } : null;
  const existingDepositIds = events
    .filter(e => (e.event_type || (e.eventType && e.eventType())) === 'MoneyDeposited')
    .map(e => e.depositId);

  return {
    account,
    existingDepositIds
  };
}