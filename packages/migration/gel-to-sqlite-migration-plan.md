# Gel to SQLite Migration Plan

This plan outlines the comprehensive migration from Gel/EdgeDB to SQLite with Effect, focusing on rebuilding edit history from Gel's audit logs and EditSuggestions, then applying changes through repository methods for proper CRDT-based revision workflow.

## Schema Analysis

### Current Gel Schema Structure
- **Authentication**: Built-in Gel auth with `ext::auth::Identity`
- **Users**: `User` with identity, email, role, timestamps
- **Profiles**: `UserProfile` with handle, name, bio, location, photo
- **Core Entities**: Vegetable, VegetableVariety, VegetableTip, Resource, Note
- **Relations**: Tags, Sources, Images, VegetableFriendship, UserWishlist
- **Contributions**: `EditSuggestion` with JSON diffs and snapshots
- **Audit Trail**: `HistoryLog` with automatic triggers for INSERT/UPDATE/DELETE

### Target SQLite Schema Structure
- **Authentication**: Better Auth with accounts, sessions, oauth_accounts
- **Profiles**: Unified `profiles` table with people/organizations
- **CRDT-based**: vegetable_crdts, resource_crdts, post_crdts with Loro documents
- **Revisions**: vegetable_revisions, resource_revisions for contribution workflow
- **Materialized**: Queryable tables derived from CRDTs
- **Junction Tables**: Normalized many-to-many relationships

## Schema Mapping Overview

| Gel Type | SQLite Target | Notes |
|----------|--------------|-------|
| `User` | `accounts` + `people` | Split into Better Auth accounts + people-specific data |
| `UserProfile` | `profiles` | Direct mapping to unified profiles table |
| `Source` | `image_credits` + `resource_credits` | Split into separate credit tables |
| `Tag` | `tags` | Direct mapping, `category` → `cluster` |
| `Image` | `images` + `image_credits` | Main image data + separate credits table |
| `Vegetable` | `vegetable_crdts` + `vegetables` + `vegetable_translations` + junction tables | CRDT-based with materialized views |
| `VegetableVariety` | `vegetable_varieties` + `vegetable_variety_translations` + `vegetable_variety_photos` | Standalone with translations and photos |
| `VegetableTip` | `post_crdts` + `posts` + `post_translations` + `post_tags` | Tips become note posts with tip subject becoming tag |
| `VegetableFriendship` | **Dropped** | Feature removed in new schema |
| `UserWishlist` | `bookmarks_vegetables` | Renamed to bookmarks pattern |
| `Note` | `post_crdts` + `posts` + `post_translations` + `post_vegetables` | Notes become posts of type "NOTE" |
| `EditSuggestion` | `vegetable_revisions` | Convert JSON diffs to CRDT updates via backward reconstruction |
| `Resource` | `resource_crdts` + `resources` + `resource_translations` + `resource_tags` + `resource_vegetables` | CRDT-based with tags and vegetable relationships |
| `BlueskyPost` | **Dropped** | Feature removed |
| `HistoryLog` | **Dropped** | CRDT provides history, unreliable snapshots anyway |

## Migration Architecture

### 1. Backward Edit History Reconstruction
The core challenge is rebuilding the complete edit history when HistoryLog snapshots are unreliable:

**Data Sources:**
- `EditSuggestion`: User-contributed diffs with snapshots and status (MERGED/REJECTED)
- Current vegetable state: Final vegetable data as endpoint
- `HistoryLog`: Partial audit trail (unreliable snapshots)

**Backward Reconstruction Strategy:**
1. **Start from Current State**: Use current vegetable data as final state
2. **Reverse Chronological**: Process EditSuggestions in reverse order (newest to oldest)
3. **Inverse Diff Application**: Apply inverse of diffs to walk backwards in time
4. **Reconstruct Initial State**: Arrive at the original creation state
5. **Forward Replay**: Apply changes forward using repository methods

**Inverse Diff Algorithm:**
```typescript
const applyInverseDiff = (
  currentState: SourceVegetableData,
  diff: JsonDiff
): SourceVegetableData => {
  // Apply inverse operations to walk backwards
  return reverseJsonDiff(currentState, diff)
}
```

### 2. Repository-Based Migration
Use the existing repository pattern for proper CRDT workflow:

**Vegetable Repository Interface:**
```typescript
interface VegetablesRepository {
  createFirstVersion(data: {
    loro_doc: LoroDoc
    person_id: PersonId
  }): Effect.Effect<VegetableId>
  
  createRevision(data: {
    vegetable_id: VegetableId
    person_id: PersonId
    crdt_update: Uint8Array
  }): Effect.Effect<VegetableRevisionId>
  
  materialize(data: {
    vegetable_id: VegetableId
    loro_crdt: Uint8Array
    source_data: SourceVegetableData
    current_crdt_frontier: string
  }): Effect.Effect<void>
}
```

**Migration Process:**
1. **Initial Creation**: Use `createFirstVersion` for the vegetable's initial state
2. **Sequential Edits**: Use `createRevision` for each historical change
3. **Materialization**: Automatic materialization through repository methods
4. **Resource Migration**: Simple creation-only process for resources

### 3. MigrationContext Service
Create an Effect service for ID mapping and progress tracking:
```typescript
interface MigrationContextService {
  resolveId<ReturnedId extends OrganizationId | PersonId | VegetableId | ...>(
    gelId: string
  ): ReturnedId
  
  planMigrationOp<SupabaseRecord extends { id: string }>(
    sourceRecord: SupabaseRecord
  ): Effect.Effect<MigrationOp>
}
```

**Implementation Details:**
- SQLite database with single `id_mappings` table
- Schema: `(gel_id TEXT PRIMARY KEY, sqlite_id TEXT, entity_type TEXT, content_hash TEXT, last_synced_at TEXT)`
- Resumable migration with progress tracking
- Generic ID resolution for all entity types

### 4. Data Transformation Pipeline
#### Phase 1: Identity & Authentication Migration
1. **Extract Gel Users**: Query User table with identities
2. **Create Better Auth Accounts**: Map to accounts table structure
3. **Preserve Roles**: Map Gel roles to Better Auth access levels
4. **Profile Migration**: Convert UserProfile to unified profiles table
5. **Organization/Person Split**: Create people and organizations tables

#### Phase 2: Core Entity Migration
1. **Tags**: Direct migration with minimal transformation
2. **Images**: Migrate with sanity_id preservation
3. **Sources**: Convert to new attribution system
4. **Resources**: Simple creation-only migration (no edit history)

#### Phase 3: Vegetable Edit History Migration
1. **Extract History**: Query HistoryLog and EditSuggestion for each vegetable
2. **Reconstruct Timeline**: Build chronological edit sequence
3. **Apply Changes**: Use repository methods in correct order
4. **Validate**: Ensure final state matches current data

### 5. Backward Reconstruction Algorithm

#### Data Collection
```typescript
interface EditSuggestionEvent {
  id: string
  timestamp: string
  performed_by: string // UserProfile ID
  target_object: string // Vegetable ID
  diff: Json // json-diff-ts format
  snapshot: Json // State after diff was applied
  status: 'PENDING_REVIEW' | 'MERGED' | 'REJECTED'
  created_at: string
}

interface ReconstructedHistory {
  initialState: SourceVegetableData
  edits: Array<{
    event: EditSuggestionEvent
    previousState: SourceVegetableData
    newState: SourceVegetableData
    crdtUpdate: Uint8Array
  }>
}
```

#### Backward Reconstruction Process
```typescript
const reconstructHistory = async (
  vegetableId: string,
  currentState: SourceVegetableData
): Promise<ReconstructedHistory> => {
  // 1. Get all approved EditSuggestions for this vegetable
  const editSuggestions = await getEditSuggestions(vegetableId)
  
  // 2. Sort by timestamp (newest first)
  const sortedEdits = editSuggestions.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  
  // 3. Walk backwards applying inverse diffs
  let previousState = currentState
  const historicalEdits = []
  
  for (const edit of sortedEdits) {
    // Apply inverse diff to get state before this edit
    const stateBeforeEdit = applyInverseDiff(previousState, edit.diff)
    
    historicalEdits.push({
      event: edit,
      previousState: stateBeforeEdit,
      newState: previousState,
      crdtUpdate: null // Will be generated in forward pass
    })
    
    previousState = stateBeforeEdit
  }
  
  // 4. Reverse to get chronological order
  historicalEdits.reverse()
  
  return {
    initialState: previousState,
    edits: historicalEdits
  }
}
```

#### Reconstruction Process
1. **Fetch Current State**: Get current vegetable data from Gel database
2. **Get EditSuggestions**: Query all approved EditSuggestions for the vegetable
3. **Sort Reverse Chronologically**: Order by timestamp (newest first)
4. **Walk Backwards**: Apply inverse diffs to reconstruct previous states
5. **Identify Creation Point**: When no more edits exist, we have the initial state
6. **Forward Migration**: Use repository methods to apply changes in correct order

#### CRDT Update Generation (Forward Pass)
```typescript
const generateCrdtUpdates = (history: ReconstructedHistory): void => {
  // Generate CRDT updates for the forward migration pass
  for (const edit of history.edits) {
    edit.crdtUpdate = generateCrdtUpdate({
      previousState: edit.previousState,
      newState: edit.newState,
      authorId: edit.event.performed_by as PersonId
    })
  }
}

const generateCrdtUpdate = ({
  previousState,
  newState,
  authorId
}: {
  previousState: SourceVegetableData
  newState: SourceVegetableData
  authorId: PersonId
}): Uint8Array => {
  const baseDoc = createDocFromVegetableData(previousState)
  return editVegetableDoc({
    initial_doc: baseDoc,
    person_id: authorId,
    updateData: () => newState
  }).crdt_update
}
```

### 6. Authentication Migration

#### Better Auth Configuration
```typescript
export const auth = betterAuth({
  database: new Database("main.sqlite"),
  user: {
    modelName: "accounts",
    fields: {
      createdAt: "created_at",
      emailVerified: "is_email_verified",
      updatedAt: "updated_at",
    },
  },
  // ... other mappings
})
```

#### Migration Steps
1. **Create Accounts**: Migrate from Gel User to accounts table
2. **Session Migration**: Convert existing sessions if needed
3. **OAuth Accounts**: Preserve third-party authentications
4. **Profile Linking**: Connect accounts to profiles

## Implementation Plan

### Step 1: Setup Migration Infrastructure
1. Create `packages/migration/package.json` with dependencies:
   - `effect`, `@effect/sql-sqlite-bun`
   - `loro-crdt`, `loro-mirror`
   - `better-auth`
   - `json-diff-ts` for reading existing diffs

2. Implement `MigrationContext` service based on reference implementation
3. Create migration database schema with `id_mappings` table
4. Setup logging and progress tracking

### Step 2: Schema Type Definitions
1. Define Effect Schemas for all Gel entities
2. Define Effect Schemas for SQLite entities
3. Create transformation functions between schemas
4. Implement validation and error handling

### 3. Step 3: Backward History Reconstruction
1. Implement json-diff-ts inverse operation
2. Create EditSuggestion querying and sorting
3. Build backward state reconstruction algorithm
4. Implement forward CRDT update generation
5. Add validation against current state

### Step 4: Repository Integration
1. Implement `createFirstVersion` wrapper for migration
2. Implement `createRevision` wrapper for migration
3. Create materialization integration
4. Add transaction handling and rollback capability

### Step 5: Migration Execution
1. Implement entity-specific migration functions
2. Create batch processing for large datasets
3. Add progress persistence and resumption
4. Implement data integrity validation

### Step 6: Testing & Validation
1. Create test datasets with known edit histories
2. Implement state validation against current data
3. Performance testing with large datasets
4. Rollback and recovery testing

## Key Challenges & Solutions

### 1. Backward History Reconstruction
**Challenge**: HistoryLog snapshots are unreliable, need to reconstruct initial state from current data
**Solution**: Walk backwards through EditSuggestions using inverse diff operations

### 2. JSON Diff Inversion
**Challenge**: Need to apply inverse of json-diff-ts patches to walk backwards in time
**Solution**: Implement inverse diff operations and validate against EditSuggestion snapshots

### 3. Repository Method Integration
**Challenge**: Using repository methods designed for live application in migration context
**Solution**: Create migration-specific wrappers that handle bulk operations and transactions

### 4. Authentication System Migration
**Challenge**: Migrating from Gel's built-in auth to Better Auth
**Solution**: Extract user identities, preserve emails and roles, create new accounts

### 5. Large Dataset Performance
**Challenge**: Processing edit history for potentially thousands of vegetables
**Solution**: Batch processing, streaming, and resumable migration with progress tracking

### 6. Data Consistency
**Challenge**: Ensuring backward reconstruction produces accurate initial state
**Solution**: Validate against EditSuggestion snapshots and final state consistency checks

## Success Criteria

1. **Complete Data Migration**: All entities successfully migrated
2. **Edit History Preservation**: Complete vegetable edit histories reconstructed through backward diff inversion
3. **CRDT Integrity**: All revisions properly created with correct CRDT updates from forward reconstruction
4. **Repository Integration**: All changes applied through proper repository methods
5. **Authentication**: Users can log in with existing credentials
6. **Performance**: Migration completes within acceptable timeframes
7. **Integrity**: Reconstructed final state matches current database state
8. **Rollback**: Ability to rollback if issues arise

## Next Steps

1. Review and approve this revised plan
2. Setup migration package infrastructure
3. Begin with Phase 1 (Identity & Authentication)
4. Implement backward history reconstruction algorithm
5. Integrate with vegetable repository methods for forward migration
6. Progress through phases with testing at each step
7. Final validation and deployment preparation
