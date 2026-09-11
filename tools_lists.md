# PrivOS MCP Tools — Lists & Items

## `privos.lists.create`

Create a new list in a room with optional field definitions and kanban stages.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg                          | Type   | Required | Description                                                    |
| ---------------------------- | ------ | -------- | -------------------------------------------------------------- |
| `roomId`                     | string | Yes      | Room ID to create the list in                                  |
| `name`                       | string | No       | List name (default: "New List")                                |
| `key`                        | string | No       | List key, must be unique (auto-generated from name if omitted) |
| `description`                | string | No       | List description                                               |
| `fieldDefinitions`           | array  | No       | Custom field definitions                                       |
| `fieldDefinitions[]._id`     | string | No       | Field ID (auto-generated if omitted)                           |
| `fieldDefinitions[].name`    | string | Yes      | Field label                                                    |
| `fieldDefinitions[].type`    | enum   | Yes      | Field type (see `addField` for full list)                      |
| `fieldDefinitions[].options` | array  | No       | For SELECT/MULTI\_SELECT: `[{ _id?, value, color? }]`          |
| `stages`                     | array  | No       | Kanban stages (defaults to single "Ungroup" stage)             |
| `stages[].name`              | string | Yes      | Stage name                                                     |
| `stages[].color`             | string | No       | Hex color (default: #6b7280)                                   |

### Response

```json
{
  "list": {
    "_id": "list_abc",
    "name": "CRM Pipeline",
    "key": "CRMP",
    "roomId": "room_xyz789",
    "fieldDefinitions": [
      { "_id": "f1", "name": "Email", "type": "TEXT", "order": 0 },
      { "_id": "f2", "name": "Status", "type": "SELECT", "order": 1, "options": [...] }
    ],
    "createdAt": "2026-04-04T10:00:00Z"
  },
  "stages": [
    { "_id": "stage_001", "name": "New", "color": "#3b82f6", "order": 0 },
    { "_id": "stage_002", "name": "In Progress", "color": "#f59e0b", "order": 1 },
    { "_id": "stage_003", "name": "Done", "color": "#22c55e", "order": 2 }
  ]
}
```

### Example

```typescript
// Create a list with fields and stages
await app.callServerTool({
  name: 'privos.lists.create',
  arguments: {
    roomId: 'room_xyz789',
    name: 'CRM Pipeline',
    description: 'Track customer leads',
    fieldDefinitions: [
      { name: 'Email', type: 'TEXT' },
      { name: 'Priority', type: 'SELECT', options: [
        { value: 'High', color: '#e74c3c' },
        { value: 'Low', color: '#2ecc71' }
      ]},
      { name: 'Assignee', type: 'ASSIGNEE' }
    ],
    stages: [
      { name: 'New', color: '#3b82f6' },
      { name: 'In Progress', color: '#f59e0b' },
      { name: 'Done', color: '#22c55e' }
    ]
  }
});

// Minimal — creates list with default "Ungroup" stage
await app.callServerTool({
  name: 'privos.lists.create',
  arguments: { roomId: 'room_xyz789', name: 'Tasks' }
});
```

***

## `privos.lists.getAll`

Get all lists in a room.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

| Arg      | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `roomId` | string | Yes      | Room ID     |

### Response

```json
[
  {
    "_id": "list_001",
    "name": "Contacts",
    "description": "Customer contact list",
    "roomId": "room_xyz789",
    "fieldDefinitions": [
      { "_id": "field_001", "name": "Email", "type": "TEXT", "order": 0 },
      { "_id": "field_002", "name": "Status", "type": "SELECT", "order": 1, "options": [{ "value": "Active" }, { "value": "Inactive" }] }
    ],
    "createdAt": "2026-03-25T10:00:00Z"
  }
]
```

### Example

```typescript
await app.callServerTool({
  name: 'privos.lists.getAll',
  arguments: { roomId: 'room_xyz789' }
});
```

***

## `privos.lists.get`

Get a single list by ID or key, including field definitions.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

At least one of `listId` or `key` is required.

| Arg      | Type   | Required | Description                       |
| -------- | ------ | -------- | --------------------------------- |
| `listId` | string | No       | List ID                           |
| `key`    | string | No       | List key (e.g. `"CRM"`, `"TASK"`) |

### Response

```json
{
  "_id": "list_001",
  "name": "Contacts",
  "description": "Customer contact list",
  "roomId": "room_xyz789",
  "fieldDefinitions": [
    { "_id": "field_001", "name": "Email", "type": "TEXT", "order": 0 },
    { "_id": "field_002", "name": "Phone", "type": "TEXT", "order": 1 }
  ],
  "createdAt": "2026-03-25T10:00:00Z"
}
```

***

## `privos.lists.updateList`

Update a list's name or description.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg           | Type   | Required | Description          |
| ------------- | ------ | -------- | -------------------- |
| `listId`      | string | Yes      | List ID              |
| `name`        | string | No       | New list name        |
| `description` | string | No       | New list description |

### Response

```json
{ "updated": true }
```

***

## `privos.lists.delete`

Soft-delete a list by ID. Sets `_deletedAt` timestamp instead of permanently removing the list. Items and stages cascade-delete but can be recovered if the list is recovered.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg      | Type   | Required | Description       |
| -------- | ------ | -------- | ----------------- |
| `listId` | string | Yes      | List ID to delete |

### Response

```json
{ "deleted": true, "listId": "list_001" }
```

### Example

```typescript
await app.callServerTool({
  name: 'privos.lists.delete',
  arguments: { listId: 'list_001' }
});
```

***

## `privos.lists.deleteMany`

Soft-delete multiple lists by IDs in one call. Maximum 100 lists per batch. Failed deletions are logged but don't stop the batch — check `deletedCount` in response.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg       | Type      | Required | Description                           |
| --------- | --------- | -------- | ------------------------------------- |
| `listIds` | string\[] | Yes      | Array of list IDs to delete (max 100) |

### Response

```json
{
  "deleted": true,
  "deletedCount": 3,
  "listIds": ["list_001", "list_002", "list_003"]
}
```

### Example

```typescript
await app.callServerTool({
  name: 'privos.lists.deleteMany',
  arguments: {
    listIds: ['list_001', 'list_002', 'list_003']
  }
});
```

***

## `privos.lists.getItems`

Get items in a list with pagination, sorting, and optional stage filter.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

| Arg                                      | Type   | Required | Description                                                     |
| ---------------------------------------- | ------ | -------- | --------------------------------------------------------------- |
| `listId`                                 | string | Yes      | List ID                                                         |
| `offset`                                 | number | No       | Position to start from (default: 0)                             |
| `count`                                  | number | No       | Number of items to return (default: 50, max: 100)               |
| `sortBy`                                 | enum   | No       | Sort field: `createdAt`, `name`, `order` (default: `createdAt`) |
| `sortOrder`                              | enum   | No       | Sort direction: `asc`, `desc` (default: `desc`)                 |
| `stageId`                                | string | No       | Filter by stage ID                                              |
| `customFieldFilters`                     | array  | No       | Filter by custom field values                                   |
| `customFieldFilters[].fieldDefinitionId` | string | Yes      | Field definition ID                                             |
| `customFieldFilters[].operator`          | enum   | Yes      | `equal` or `in`                                                 |
| `customFieldFilters[].value`             | any    | Yes      | Single value for `equal`, array for `in`                        |

### Response

```json
{
  "items": [
    {
      "_id": "item_001",
      "name": "John Doe",
      "description": "VIP customer",
      "listId": "list_001",
      "stageId": "stage_001",
      "order": 0,
      "customFields": [
        { "fieldId": "field_001", "value": "john@example.com" },
        { "fieldId": "field_002", "value": "+1-555-0100" }
      ],
      "createdAt": "2026-03-25T10:00:00Z"
    }
  ],
  "count": 50,
  "offset": 0,
  "total": 150
}
```

### Example

```typescript
// First page, newest first
await app.callServerTool({
  name: 'privos.lists.getItems',
  arguments: { listId: 'list_001' }
});

// Second page
await app.callServerTool({
  name: 'privos.lists.getItems',
  arguments: { listId: 'list_001', offset: 50, count: 50 }
});

// Filter by stage, sorted by order
await app.callServerTool({
  name: 'privos.lists.getItems',
  arguments: { listId: 'list_001', stageId: 'stage_001', sortBy: 'order', sortOrder: 'asc' }
});

// Filter by custom fields
await app.callServerTool({
  name: 'privos.lists.getItems',
  arguments: {
    listId: 'list_001',
    customFieldFilters: [
      { fieldDefinitionId: 'field_status', operator: 'equal', value: 'Active' },
      { fieldDefinitionId: 'field_priority', operator: 'in', value: ['High', 'Critical'] }
    ]
  }
});
```

***

## `privos.lists.getItem`

Get full item detail by ID, including all custom fields.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

| Arg      | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `itemId` | string | Yes      | Item ID     |

### Response

```json
{
  "_id": "item_001",
  "name": "John Doe",
  "description": "VIP customer",
  "listId": "list_001",
  "stageId": "stage_001",
  "order": 0,
  "customFields": {
    "field_001": "john@example.com",
    "field_002": "+1-555-0100"
  },
  "parentId": null,
  "createdAt": "2026-03-25T10:00:00Z"
}
```

***

## `privos.lists.createItem`

Create a new item in a list. Automatically assigns to the first stage.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg            | Type   | Required | Description                                |
| -------------- | ------ | -------- | ------------------------------------------ |
| `listId`       | string | Yes      | List ID                                    |
| `title`        | string | Yes      | Item title/name                            |
| `description`  | string | No       | Item description                           |
| `customFields` | array  | No       | Array of `{ fieldId: string, value: any }` |

### Response

```json
{
  "_id": "item_123",
  "name": "John Doe",
  "listId": "list_001"
}
```

### Example

```typescript
await app.callServerTool({
  name: 'privos.lists.createItem',
  arguments: {
    listId: 'list_001',
    title: 'John Doe',
    description: 'New customer',
    customFields: [
      { fieldId: 'field_001', value: 'john@example.com' },
      { fieldId: 'field_002', value: '+1-555-0100' }
    ]
  }
});
```

***

## `privos.lists.updateItem`

Update an item's title, description, or custom fields.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg            | Type   | Required | Description                                |
| -------------- | ------ | -------- | ------------------------------------------ |
| `itemId`       | string | Yes      | Item ID                                    |
| `title`        | string | No       | New item title                             |
| `description`  | string | No       | New item description                       |
| `customFields` | array  | No       | Array of `{ fieldId: string, value: any }` |

### Response

```json
{ "updated": true }
```

***

## `privos.lists.deleteItem`

Delete an item from a list.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg      | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `itemId` | string | Yes      | Item ID     |

### Response

```json
{ "deleted": true }
```

***

## `privos.lists.deleteItems`

Batch delete multiple items by IDs or by custom field filter query. At least one of `itemIds` or `customFieldFilters` is required.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg                                      | Type      | Required    | Description                              |
| ---------------------------------------- | --------- | ----------- | ---------------------------------------- |
| `listId`                                 | string    | Conditional | Required when using `customFieldFilters` |
| `itemIds`                                | string\[] | No          | Array of item IDs to delete              |
| `customFieldFilters`                     | array     | No          | Delete items matching these conditions   |
| `customFieldFilters[].fieldDefinitionId` | string    | Yes         | Field definition ID                      |
| `customFieldFilters[].operator`          | enum      | Yes         | `equal` or `in`                          |
| `customFieldFilters[].value`             | any       | Yes         | Single value for `equal`, array for `in` |

### Response

```json
{ "deleted": true, "deletedCount": 5 }
```

### Example

```typescript
// Delete by IDs
await app.callServerTool({
  name: 'privos.lists.deleteItems',
  arguments: {
    itemIds: ['item_001', 'item_002', 'item_003']
  }
});

// Delete by custom field filter
await app.callServerTool({
  name: 'privos.lists.deleteItems',
  arguments: {
    listId: 'list_001',
    customFieldFilters: [
      { fieldDefinitionId: 'field_status', operator: 'equal', value: 'Archived' }
    ]
  }
});

// Delete by multiple conditions
await app.callServerTool({
  name: 'privos.lists.deleteItems',
  arguments: {
    listId: 'list_001',
    customFieldFilters: [
      { fieldDefinitionId: 'field_status', operator: 'in', value: ['Cancelled', 'Expired'] },
      { fieldDefinitionId: 'field_priority', operator: 'equal', value: 'Low' }
    ]
  }
});
```

***

## `privos.lists.getItemsByStage`

Get items in a specific kanban stage.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

| Arg       | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| `listId`  | string | Yes      | List ID             |
| `stageId` | string | Yes      | Stage ID            |
| `limit`   | number | No       | Max items to return |

### Response

```json
[
  {
    "_id": "item_001",
    "name": "John Doe",
    "listId": "list_001",
    "stageId": "stage_001",
    "order": 0,
    "customFields": { ... }
  }
]
```

***

## `privos.lists.getItemsByStages`

Get all items grouped by multiple stages in one call. Useful for loading a kanban board or viewing items across several columns at once.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

| Arg        | Type      | Required | Description                 |
| ---------- | --------- | -------- | --------------------------- |
| `listId`   | string    | Yes      | List ID                     |
| `stageIds` | string\[] | Yes      | Array of stage IDs to fetch |

### Response

Items grouped by stage ID. Stages with no items return an empty array.

```json
{
  "stage_001": [
    { "_id": "item_001", "name": "Task A", "stageId": "stage_001", "order": 0, "customFields": [...] },
    { "_id": "item_002", "name": "Task B", "stageId": "stage_001", "order": 1, "customFields": [...] }
  ],
  "stage_002": [
    { "_id": "item_003", "name": "Task C", "stageId": "stage_002", "order": 0, "customFields": [...] }
  ],
  "stage_003": []
}
```

### Example

```typescript
// Load all items for 3 kanban columns
await app.callServerTool({
  name: 'privos.lists.getItemsByStages',
  arguments: {
    listId: 'list_001',
    stageIds: ['stage_001', 'stage_002', 'stage_003']
  }
});
```

***

## `privos.lists.moveItemToStage`

Move an item to a different kanban stage.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg       | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `itemId`  | string | Yes      | Item ID         |
| `stageId` | string | Yes      | Target stage ID |

### Response

```json
{ "moved": true }
```

***

## `privos.lists.reorderItem`

Change an item's position within its current stage.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg      | Type   | Required | Description        |
| -------- | ------ | -------- | ------------------ |
| `itemId` | string | Yes      | Item ID            |
| `order`  | number | Yes      | New order position |

### Response

```json
{ "reordered": true }
```

***

## `privos.lists.updateCustomField`

Update a single custom field value on an item.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg       | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| `itemId`  | string | Yes      | Item ID             |
| `fieldId` | string | Yes      | Field definition ID |
| `value`   | any    | Yes      | New field value     |

### Response

```json
{ "updated": true }
```

### Example

```typescript
await app.callServerTool({
  name: 'privos.lists.updateCustomField',
  arguments: {
    itemId: 'item_001',
    fieldId: 'field_002',
    value: '+1-555-0200'
  }
});
```

***

## `privos.lists.searchItems`

Search items by name in a list.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

| Arg      | Type   | Required | Description               |
| -------- | ------ | -------- | ------------------------- |
| `listId` | string | Yes      | List ID                   |
| `query`  | string | Yes      | Search query              |
| `limit`  | number | No       | Max results (default: 50) |

### Response

```json
[
  {
    "_id": "item_001",
    "name": "John Doe",
    "listId": "list_001",
    "customFields": { ... }
  }
]
```

***

## `privos.lists.getSubItems`

Get child/sub-items of a parent item.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `lists:read` |

### Arguments

| Arg        | Type   | Required | Description    |
| ---------- | ------ | -------- | -------------- |
| `parentId` | string | Yes      | Parent item ID |

### Response

```json
[
  {
    "_id": "item_002",
    "name": "Sub-task 1",
    "parentId": "item_001",
    "listId": "list_001"
  }
]
```

***

## `privos.lists.addField`

Add a new custom field definition to a list.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg       | Type   | Required | Description                                           |
| --------- | ------ | -------- | ----------------------------------------------------- |
| `listId`  | string | Yes      | List ID                                               |
| `fieldId` | string | No       | Custom field ID (auto-generated if omitted)           |
| `name`    | string | Yes      | Field label                                           |
| `type`    | enum   | Yes      | Field type (see below)                                |
| `options` | array  | No       | For SELECT/MULTI\_SELECT: `[{ _id?, value, color? }]` |

**Field Types:** `TEXT`, `TEXTAREA`, `NUMBER`, `DATE`, `DATE_TIME`, `SELECT`, `MULTI_SELECT`, `CHECKBOX`, `URL`, `USER`, `FILE`, `FILE_MULTIPLE`, `DOCUMENT`, `ASSIGNEE`, `DEADLINE`, `DEPENDENCIES`

### Response

```json
{
  "_id": "field_789",
  "name": "Email",
  "type": "TEXT",
  "order": 3
}
```

### Example: SELECT field with options

```typescript
await app.callServerTool({
  name: 'privos.lists.addField',
  arguments: {
    listId: 'list_001',
    name: 'Source',
    type: 'SELECT',
    options: [
      { value: 'Web' },
      { value: 'Email' },
      { value: 'Phone' }
    ]
  }
});
```

***

## `privos.lists.removeField`

Remove a custom field definition from a list.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg       | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `listId`  | string | Yes      | List ID                       |
| `fieldId` | string | Yes      | Field definition ID to remove |

### Response

```json
{ "removed": true }
```

***

## `privos.lists.batchAddFields`

Add multiple custom field definitions to a list in one call. More efficient than calling `addField` repeatedly.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg                | Type   | Required | Description                                           |
| ------------------ | ------ | -------- | ----------------------------------------------------- |
| `listId`           | string | Yes      | Target list ID                                        |
| `fields`           | array  | Yes      | Array of field definitions to create                  |
| `fields[]._id`     | string | No       | Field ID (auto-generated if omitted)                  |
| `fields[].name`    | string | Yes      | Field label                                           |
| `fields[].type`    | enum   | Yes      | Field type (see `addField` for full list)             |
| `fields[].options` | array  | No       | For SELECT/MULTI\_SELECT: `[{ _id?, value, color? }]` |

### Response

```json
{
  "created": 4,
  "fields": [
    { "_id": "abc123def", "name": "Email", "type": "TEXT", "order": 0 },
    { "_id": "ghi456jkl", "name": "Priority", "type": "SELECT", "order": 1, "options": [
      { "_id": "opt1", "value": "High", "color": "#e74c3c", "order": 0 },
      { "_id": "opt2", "value": "Medium", "color": "#f39c12", "order": 1 },
      { "_id": "opt3", "value": "Low", "color": "#2ecc71", "order": 2 }
    ]},
    { "_id": "mno789pqr", "name": "Due Date", "type": "DEADLINE", "order": 2 },
    { "_id": "stu012vwx", "name": "Assignee", "type": "ASSIGNEE", "order": 3 }
  ]
}
```

### Example

```typescript
await app.callServerTool({
  name: 'privos.lists.batchAddFields',
  arguments: {
    listId: 'list_001',
    fields: [
      { name: 'Email', type: 'TEXT' },
      { name: 'Priority', type: 'SELECT', options: [
        { value: 'High', color: '#e74c3c' },
        { value: 'Medium', color: '#f39c12' },
        { value: 'Low', color: '#2ecc71' }
      ]},
      { name: 'Due Date', type: 'DEADLINE' },
      { name: 'Assignee', type: 'ASSIGNEE' }
    ]
  }
});
```

***

## `privos.lists.batchCreateItems`

Create multiple items in a list in one call. Items default to the first stage unless `stageId` is specified per item.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `lists:write` |

### Arguments

| Arg                    | Type   | Required | Description                                |
| ---------------------- | ------ | -------- | ------------------------------------------ |
| `listId`               | string | Yes      | Target list ID                             |
| `items`                | array  | Yes      | Array of items to create                   |
| `items[].title`        | string | Yes      | Item title/name                            |
| `items[].description`  | string | No       | Item description                           |
| `items[].stageId`      | string | No       | Target stage ID (defaults to first stage)  |
| `items[].customFields` | array  | No       | Array of `{ fieldId: string, value: any }` |

### Response

```json
{
  "created": 3,
  "items": [
    { "_id": "item_abc", "name": "John Doe", "key": "CRM-1" },
    { "_id": "item_def", "name": "Jane Smith", "key": "CRM-2" },
    { "_id": "item_ghi", "name": "Bob Wilson", "key": "CRM-3" }
  ]
}
```

### Example

```typescript
await app.callServerTool({
  name: 'privos.lists.batchCreateItems',
  arguments: {
    listId: 'list_001',
    items: [
      {
        title: 'John Doe',
        customFields: [
          { fieldId: 'field_email', value: 'john@example.com' },
          { fieldId: 'field_priority', value: 'priority_hight' }
        ]
      },
      {
        title: 'Jane Smith',
        description: 'VIP customer',
        stageId: 'stage_002',
        customFields: [
          { fieldId: 'field_email', value: 'jane@example.com' }
        ]
      },
      { title: 'Bob Wilson' }
    ]
  }
});
```
