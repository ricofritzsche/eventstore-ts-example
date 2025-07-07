import { EventFilter } from '../../eventstore';
import { IEventStore } from '../../eventstore/types';
import { OpenBankAccountCommand, OpenAccountResult } from './types';
import { processOpenAccountCommand } from './core';
import { BankAccountOpenedEvent } from './events';
import { v4 as uuidv4 } from 'uuid';

export async function execute(
  eventStore: IEventStore,
  command: OpenBankAccountCommand
): Promise<OpenAccountResult> {
  const accountId = uuidv4();
  
  const openAccountState = await getOpenAccountState(eventStore, command.customerName);
  
  const result = processOpenAccountCommand(command, accountId, openAccountState.existingCustomerNames);
  
  if (!result.success) {
    return result;
  }

  try {
    const filter = EventFilter.createFilter(['BankAccountOpened'])
      .withPayloadPredicate('customerName', command.customerName);
    
    const event = new BankAccountOpenedEvent(
      result.event.accountId,
      result.event.customerName,
      result.event.accountType,
      result.event.initialDeposit,
      result.event.currency,
      result.event.openedAt
    );
    
    await eventStore.append(filter, [event]);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InvalidCustomerName', message: 'Failed to save account opening event' }
    };
  }
}

async function getOpenAccountState(eventStore: IEventStore, customerName: string): Promise<{
  existingCustomerNames: string[];
}> {
  const filter = EventFilter.createFilter(['BankAccountOpened']);
  
  const allEvents = await eventStore.query<any>(filter);
  
  const existingCustomerNames = allEvents.map(e => e.customerName);

  return {
    existingCustomerNames
  };
}

