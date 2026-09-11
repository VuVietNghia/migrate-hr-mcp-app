export const INVITE_MAIL_SENT_FIELD_ID = 'interview_invite_sent';

type CustomField = {
  fieldId?: string;
  fieldDefinitionId?: string;
  value: unknown;
};

function toCustomFieldArray(customFields: unknown): CustomField[] {
  if (Array.isArray(customFields)) return customFields;
  if (customFields && typeof customFields === 'object') {
    return Object.entries(customFields).map(([fieldId, value]) => ({ fieldId, value }));
  }
  return [];
}

export function wasInviteMailSent(customFields: unknown): boolean {
  return toCustomFieldArray(customFields).some((field) => {
    const fieldId = field.fieldId || field.fieldDefinitionId;
    return fieldId === INVITE_MAIL_SENT_FIELD_ID && field.value === true;
  });
}

export function markInviteMailSent(customFields: unknown): CustomField[] {
  return [
    ...toCustomFieldArray(customFields).filter((field) =>
      (field.fieldId || field.fieldDefinitionId) !== INVITE_MAIL_SENT_FIELD_ID,
    ),
    { fieldId: INVITE_MAIL_SENT_FIELD_ID, value: true },
  ];
}
