# Gororobas: Data Model & Application Context

## 1. Project Overview
**Gororobas** is a digital territory for agroecology. It serves as a bridge between ancestral knowledge and modern regenerative agriculture. The platform is open-source, independent of venture capital, and aims to be a "Wikipedia meets Social Network" for the agroecological community.

The application has three distinct pillars:
1.  **The Encyclopedia (Wiki):** A collaborative database of plants, varieties, and their ecological relationships (consortiums). It features a specific "Edit Proposal" workflow to handle community contributions and conflict resolution (auditable history).
2.  **The Social Network (Notes):** A blogging/micro-blogging hybrid where users publish "Notes." These notes are rich-text (Tiptap), can cite vegetables or other users, and are served via a **randomized, non-addictive feed**.
3.  **The Library:** A collection of external resources (videos, PDFs, databases) indexed and linked to the encyclopedia entities.

**Target Audience:** Farmers, gardeners, and agroforestry practitioners in Latin America.
**Languages:** Portuguese (PT) and Spanish (ES).

---

## 2. Core Architectural Concepts

*   **Handles:** All public-facing entities (Profiles, Vegetables, Varieties, Notes, Resources) must have a unique `handle` for URL composition (e.g., `gororobas.com/v/milho-crioulo`).
*   **Localization:** Text content (Descriptions, Names) is stored in JSON objects containing `pt` and `es` keys.
*   **Rich Text & Search:** User-generated content (Notes, Wiki Descriptions) is stored as **Tiptap JSON** (for rendering) AND **Plain Text** (derived, for Full-Text Search).
*   **The Random Feed:** Notes are retrieved in a deterministic random order. Every request gets assigned a seed from which we generate a random array of note indexes (0 through the highest index). This way we can paginate in the feed without repeating results.
*   **Graph Relations:** The system relies heavily on graph edges for:
    *   **Consortiums:** Biological compatibility between plants.
    *   **Mentions:** Notes citing other entities (Polymorphic: A note can mention a Person, a Vegetable, a Resource, or another Note).

---

## 3. Entity Relationship Diagram

```mermaid
erDiagram
    %% --- ACTORS ---
    USER {
      uuid id PK
      string email
      enum role "ADMIN | MODERATOR | USER"
    }
       
    PROFILE {
        uuid id PK
        uuid user_id FK
        string handle "Unique URL slug"
        string name
        string bio
        string avatar_url
        geolocation location
        string type "Person | Organization"
        enum role "User | Guardian (Mod) | Admin"
        datetime created_at
    }

    %% --- CONTENT (SOCIAL) ---
    NOTE {
        record_id id
        string handle "Unique"
        datetime created_at
        
        %% Content
        json content_json "Tiptap Structure"
        string content_text "Plain text for FTS"
        json translations "Ai Generated {pt:..., es:...}"
        string original_language "pt | es"
        enum types "EXPERIMENT | QUESTION | ..."
        enum publish_status "PUBLIC | PRIVATE | COMMUNITY"
        
        %% Feed Mechanics
        int note_index "Monotonically increasing"
    }

    %% --- ENCYCLOPEDIA (WIKI) ---
    VEGETABLE {
        record_id id
        string handle "Unique"
        
        %% Taxonomy
        string[] scientific_names
        string stratum "Emergent | High | Medium | Low"
        enum[] strata
        enum[] lifecycles
        enum[] uses
        enum[] edible_parts
        enum[] planting_methods
        range height_cm
        range temp_celsius
        range cycle_days
        photo[] photos
        
        %% I18n Data
        json common_names "{ pt: string[], es: string[] }"
        json description "{ pt: {json, text}, es: {json, text} }"
        json origin "{ pt: string, es: string }"
        json gender "{ pt: "MALE" | "FEMALE" | "NEUTRAL", es: "MALE" | "FEMALE" | "NEUTRAL" }"
        
    }

    VARIETY {
        record_id id
        string handle "Unique"
        
        %% Identification
        string[] scientific_names
        json common_names "{ pt: string[], es: string[] }"
        json description "{ pt: {json, text}, es: {json, text} }"
        
        %% Taxonomy - inherit from parent Vegetable, but can be overwritten
        string[] scientific_names
        string stratum "Emergent | High | Medium | Low"
        enum[] strata
        enum[] lifecycles
        enum[] uses
        enum[] edible_parts
        enum[] planting_methods
        range height_cm
        range temp_celsius
        range cycle_days
        photo[] photos
    }

    %% --- WIKI GOVERNANCE ---
    EDIT_PROPOSAL {
        record_id id
        record_id target_id "Pointer to Veg/Variety"
        record_id author_id "Pointer to Profile"
        
        string operation "ADD_NAME | UPDATE_DESC | ..."
        json payload "The data to apply"
        enum status "PENDING | APPLIED | REJECTED"
        string reject_reason
        datetime created_at
    }

    %% --- LIBRARY ---
    RESOURCE {
        record_id id
        string handle
        string url
        enum format "VIDEO | BOOK | ..."
        
        %% I18n Data
        json title "{ pt: string, es: string }"
        json description "{ pt: {json, text}, es: {json, text} }"
        string original_language
    }

    %% --- RELATIONSHIPS (EDGES) ---

    %% Authorship
    PROFILE ||--o{ NOTE : "published"
    PROFILE ||--o{ EDIT_PROPOSAL : "proposed"

    %% Hierarchy
    VEGETABLE ||--o{ VARIETY : "has_variety"

    %% Ecological Graph (Consortium)
    VEGETABLE }|--|{ VEGETABLE : "consortium_with"

    %% The Polymorphic 'Mention'
    %% A note can mention ANY of these entities
    NOTE }|--|{ VEGETABLE : "mentions"
    NOTE }|--|{ VARIETY : "mentions"
    NOTE }|--|{ PROFILE : "mentions"
    NOTE }|--|{ RESOURCE : "mentions"
    NOTE }|--|{ NOTE : "mentions (reply/quote)"

    %% Resource Links
    RESOURCE }|--|{ VEGETABLE : "related_to"
```

## 4. Key Data Requirements for Schema Generation

1.  **Polymorphism:** The `mentions` edge is strictly polymorphic. It starts at a `note` and can point to `vegetable`, `variety`, `profile`, `resource`, or `note`.
2.  **Indexing:**
    *   `handle`: Must be unique per table (or globally unique if possible).
    *   `content_text`: Needs a Full-Text Search analyzer (supporting Latin characters).
    *   Sorting notes randomly: we need a way to gather the number of notes in the database to then generate a random array of indexes
3.  **Arrays vs. Edges:**
    *   `scientific_names` and `names` are simple string arrays within the record.
    *   `consortium_with` is a graph edge because we might eventually add metadata to this relationship, though it is currently simple.
4.  **Wiki History:** The `edit_proposal` table is the source of truth for "Who changed what." The `vegetable` record represents the *current approved state*.

