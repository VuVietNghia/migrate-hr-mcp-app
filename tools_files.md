# PrivOS MCP Tools — Files

## `privos.files.getByChannel`

Get files in a channel, optionally filtered by folder.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `files:read` |

### Arguments

| Arg         | Type   | Required | Description                    |
| ----------- | ------ | -------- | ------------------------------ |
| `channelId` | string | Yes      | Channel/room ID                |
| `folderId`  | string | No       | Filter by folder ID            |
| `skip`      | number | No       | Pagination offset (default: 0) |
| `limit`     | number | No       | Max results (default: 50)      |

### Response

Each file includes a `downloadUrl` (presigned MinIO URL) when the file has been uploaded.

```json
[
  {
    "_id": "file_001",
    "name": "document.pdf",
    "description": "Project proposal",
    "file_type": "pdf",
    "file_size": 1048576,
    "channel_id": "room_xyz789",
    "folder_id": "folder_001",
    "user_id": "user_123",
    "downloadUrl": "https://minio.example.com/files/room_xyz789/folder_001/document.pdf?X-Amz-...",
    "created_at": "2026-03-25T10:00:00Z"
  }
]
```

### Example

```typescript
// Get all files in a channel
await app.callServerTool({
  name: 'privos.files.getByChannel',
  arguments: { channelId: 'room_xyz789' }
});

// Get files in a specific folder
await app.callServerTool({
  name: 'privos.files.getByChannel',
  arguments: { channelId: 'room_xyz789', folderId: 'folder_001', limit: 20 }
});
```

***

## `privos.files.get`

Get file details by ID, including download URL.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `files:read` |

### Arguments

| Arg      | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `fileId` | string | Yes      | File ID     |

### Response

```json
{
  "_id": "file_001",
  "name": "document.pdf",
  "description": "Project proposal",
  "file_type": "pdf",
  "file_size": 1048576,
  "channel_id": "room_xyz789",
  "folder_id": "folder_001",
  "user_id": "user_123",
  "downloadUrl": "https://minio.example.com/files/room_xyz789/folder_001/document.pdf?X-Amz-...",
  "created_at": "2026-03-25T10:00:00Z"
}
```

***

## `privos.files.search`

Search files by name in a channel. Returns matching files with download URLs.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `files:read` |

### Arguments

| Arg         | Type   | Required | Description                                |
| ----------- | ------ | -------- | ------------------------------------------ |
| `channelId` | string | Yes      | Channel/room ID                            |
| `query`     | string | Yes      | Search query (case-insensitive name match) |
| `limit`     | number | No       | Max results (default: 20)                  |

### Response

```json
[
  {
    "_id": "file_001",
    "name": "document.pdf",
    "channel_id": "room_xyz789",
    "file_type": "pdf",
    "file_size": 1048576,
    "downloadUrl": "https://minio.example.com/files/room_xyz789/document.pdf?X-Amz-...",
    "created_at": "2026-03-25T10:00:00Z"
  }
]
```

***

## `privos.files.count`

Count files in a channel or folder.

| ​         | ​            |
| --------- | ------------ |
| **Scope** | `files:read` |

### Arguments

| Arg         | Type   | Required | Description      |
| ----------- | ------ | -------- | ---------------- |
| `channelId` | string | Yes      | Channel/room ID  |
| `folderId`  | string | No       | Filter by folder |

### Response

```json
{ "count": 42 }
```

***

## `privos.files.update`

Update file metadata (name, description, or folder).

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `files:write` |

### Arguments

| Arg           | Type   | Required | Description              |
| ------------- | ------ | -------- | ------------------------ |
| `fileId`      | string | Yes      | File ID                  |
| `name`        | string | No       | New file name            |
| `description` | string | No       | New description          |
| `folderId`    | string | No       | Move to different folder |

### Response

Returns the updated file object.

```json
{
  "_id": "file_001",
  "name": "renamed-document.pdf",
  "description": "Updated proposal",
  "folderId": "folder_002"
}
```

***

## `privos.files.delete`

Delete a file.

| ​         | ​             |
| --------- | ------------- |
| **Scope** | `files:write` |

### Arguments

| Arg      | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `fileId` | string | Yes      | File ID     |

### Response

```json
{ "deleted": true }
```
