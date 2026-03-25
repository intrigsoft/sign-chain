-- =============================================================================
-- File:    clinic_tables_20260220_ferry.sql
-- Author:  Ferry (corrected from Alan's clinic_tables_20260220.sql)
-- Date:    2026-02-23
-- Purpose: Clinic master, features, rooms, stations, grouping, billing details.
--          This file supersedes the clinic-related tables in
--          referral_memo_user_clinic_schema_20260214.sql (clinics, clinic_features,
--          clinic_rooms). Alan's original file preserved as legacy reference.
--
-- Prerequisites (must exist before running this file):
--   - referral_memo_user_clinic_schema_20260214.sql tables:
--       users, master_clinic_types, master_clinic_invoice_groups, countries
--   - Extensions: pgcrypto (gen_random_uuid), citext (stations.station_name)
--
-- Tables (8):
--   1. clinics                  (DUPLICATE — supersedes 20260214)
--   2. clinic_features          (DUPLICATE — supersedes 20260214)
--   3. clinic_rooms             (DUPLICATE — supersedes 20260214, modified)
--   4. stations                 (NEW)
--   5. rooms_stations           (NEW)
--   6. clinic_group             (NEW)
--   7. clinic_group_mapping     (NEW)
--   8. clinic_billing_details   (NEW)
--
-- Changelog:
--   2026-02-20  Alan    Original clinic_tables_20260220.sql (8 tables)
--   2026-02-23  Ferry   Corrected version — 18 fixes applied:
--     [CR1] Fixed clinic_rooms FK: doctor_id → service_provider_id
--     [CR2] Added missing semicolons on stations, rooms_stations, clinic_group,
--           clinic_group_mapping
--     [CR3] Added missing comma in rooms_stations before CONSTRAINT
--     [CR4] Added FK constraints to rooms_stations (room_id → clinic_rooms,
--           station_id → stations)
--     [H5]  Added CHECK constraint on clinic_billing_details.ref_type
--     [H6]  Added NOT NULL on clinic_billing_details.billing_id
--     [M1]  Added missing indexes (clinic_group_mapping.clinic_id,
--           rooms_stations.station_id, clinic_billing_details.ref_type)
--     [M3]  Added unique index on clinic_features(clinic_id, feature_code)
--     [M4]  Restored clinics FKs to master_clinic_types + master_clinic_invoice_groups
--           + countries (were in 20260214 but missing in 20260220)
--     [M5]  Normalized public. schema prefix on all tables
--     [M6]  Added version column for optimistic locking (clinics, clinic_group,
--           clinic_billing_details)
--     [+]   Added CHECK on clinics.status
--     [+]   Added IF NOT EXISTS on all CREATE TABLE / CREATE INDEX
--     [+]   Added clinic_group_mapping FKs to clinic_group + clinics
--     [+]   Added NOT NULL + CHECK on clinic_billing_details.ref_type
--     [+]   Added QUESTION FOR ALAN comments on 5 architectural decisions
--     [+]   Added FERRY FIX comments on every change
--     [+]   Added NOTE comments on duplicate tables
-- =============================================================================

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;


-- =========================================================================
-- 1. clinics
-- =========================================================================
-- NOTE: This table supersedes public.clinics in
-- referral_memo_user_clinic_schema_20260214.sql. Key differences:
--   - Added address fields inline (see QUESTION FOR ALAN [Q2] below)
--   - Commented out referral_locked / ignore_mhcp_auto_submit (see Q3)
--   - Added group_name (see Q1)
--   - Added version column for optimistic locking
--   - Added status CHECK constraint

-- Purpose: Canonical clinic master with regulatory, contact, and operational flags.
CREATE TABLE IF NOT EXISTS public.clinics (
    clinic_id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_code character varying(50) NOT NULL,
    clinic_name character varying(200) NOT NULL,

    -- QUESTION FOR ALAN [Q1]: You also created clinic_group + clinic_group_mapping
    -- tables below for proper many-to-many grouping. Having group_name here as a
    -- free-text field is redundant and will get out of sync with the clinic_group
    -- table. Should we remove group_name and rely solely on clinic_group +
    -- clinic_group_mapping? Or is this a quick-reference / denormalized cache?
    group_name character varying(200),

    legal_name character varying(200),

    -- FERRY FIX: Added CHECK constraint on status (was unchecked varchar)
    status character varying(30) DEFAULT 'ACTIVE' NOT NULL
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED')),

    clinic_type character varying(50),
    email character varying(200),
    contact_number character varying(50),
    whatsapp_number character varying(50),
    company_registration_no character varying(100),
    gst_registration_no character varying(100),
    uen character varying(100),
    he_code character varying(100),
    pcn_registered boolean DEFAULT false,

    -- QUESTION FOR ALAN [Q3]: referral_locked and ignore_mhcp_auto_submit are
    -- commented out. Should these be moved to clinic_features as feature toggles
    -- (e.g., feature_code = 'REFERRAL_LOCKED', 'IGNORE_MHCP_AUTO_SUBMIT')?
    -- Or are they fully deprecated? If existing referral logic depends on these
    -- columns, removing them will break functionality. Please confirm.
    -- referral_locked boolean DEFAULT false,
    -- ignore_mhcp_auto_submit boolean DEFAULT false,

    clinic_logo_url text,
    domain character varying(255),
    youtube_url text,
    invoice_group_id uuid,

    -- QUESTION FOR ALAN [Q2]: In referral_memo_user_clinic_schema_20260214.sql,
    -- addresses are in a separate clinic_addresses table (normalized, supports
    -- multiple addresses with is_primary flag — e.g., billing vs physical address).
    -- Your version embeds address directly here (denormalized, single address only).
    -- Which approach should we keep?
    -- Ferry's thought: Maybe clinics often have different billing, correspondence, and physical addresses. Consider keeping the
    -- normalized clinic_addresses table from 20260214.
    address_line1 character varying(300) NOT NULL,
    address_line2 character varying(300),
    city character varying(100),
    state character varying(100),
    postal_code character varying(30),
    country_id uuid,

    -- FERRY FIX [M6]: Added version for optimistic locking (same pattern as
    -- inventory transaction tables)
    -- version integer NOT NULL DEFAULT 1, --- AY not needed. 

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,

    CONSTRAINT clinics_pkey PRIMARY KEY (clinic_id)
);

-- FERRY FIX: Added case-insensitive unique index on clinic_code (was in 20260214
-- but missing in 20260220)
CREATE UNIQUE INDEX IF NOT EXISTS ux_clinics_code_ci
    ON public.clinics (lower(clinic_code));

-- FERRY FIX [M4]: Restored FK to master_clinic_types (was in 20260214 but missing
-- in 20260220). clinic_type references the canonical type list.
ALTER TABLE public.clinics
    ADD CONSTRAINT IF NOT EXISTS clinics_clinic_type_fkey
    FOREIGN KEY (clinic_type)
    REFERENCES public.master_clinic_types (clinic_type_code) ON DELETE SET NULL;

-- FERRY FIX [M4]: Restored FK to master_clinic_invoice_groups (was in 20260214 but
-- missing in 20260220).
ALTER TABLE public.clinics
    ADD CONSTRAINT IF NOT EXISTS clinics_invoice_group_id_fkey
    FOREIGN KEY (invoice_group_id)
    REFERENCES public.master_clinic_invoice_groups (clinic_invoice_group_id)
    ON DELETE SET NULL;

-- FERRY FIX: Added FK to countries for country_id (was in clinic_addresses in
-- 20260214, now needed here since address is embedded).
ALTER TABLE public.clinics
    ADD CONSTRAINT IF NOT EXISTS clinics_country_id_fkey
    FOREIGN KEY (country_id)
    REFERENCES public.countries (id) ON DELETE SET NULL;

-- =========================================================================
-- 2. clinic_features
-- =========================================================================
-- NOTE: This table supersedes public.clinic_features in
-- referral_memo_user_clinic_schema_20260214.sql. Identical structure but this
-- version adds IF NOT EXISTS.

-- Purpose: Feature toggles per clinic (e.g., GST enabled, NEHR integration).
CREATE TABLE IF NOT EXISTS public.clinic_features (
    clinic_feature_id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    feature_code character varying(80) NOT NULL,  -- e.g., 'GST' = clinic is GST-registered
                                                  --        'NEHR' = NEHR integration enabled
    is_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,

    CONSTRAINT clinic_features_pkey PRIMARY KEY (clinic_feature_id),
    CONSTRAINT clinic_features_clinic_id_fkey FOREIGN KEY (clinic_id)
        REFERENCES public.clinics (clinic_id) ON DELETE CASCADE
);

-- FERRY FIX [M3]: Added unique index on (clinic_id, feature_code) to prevent
-- duplicate feature codes per clinic. Was in 20260214 but missing in 20260220.
CREATE UNIQUE INDEX IF NOT EXISTS ux_clinic_features_code_ci
    ON public.clinic_features (clinic_id, lower(feature_code));


-- =========================================================================
-- 3. clinic_rooms
-- =========================================================================
-- NOTE: This table supersedes public.clinic_rooms in
-- referral_memo_user_clinic_schema_20260214.sql. Key change: doctor_id renamed
-- to service_provider_id (more generic — supports nurses, pharmacists, physios).

-- QUESTION FOR ALAN [Q5]: YouWe have agreed to renamed doctor_id to service_provider_id (good —
-- supports nurses, pharmacists, physiotherapists etc., not just doctors). But in
-- your original file, the FK constraint still referenced doctor_id which would
-- cause a CREATE TABLE failure. I fixed the FK below. Please confirm you want
-- service_provider_id as the final column name.

-- Purpose: Consultation room registry per clinic.
CREATE TABLE IF NOT EXISTS public.clinic_rooms (
    room_id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    room_number integer NOT NULL,
    room_name character varying(100),
    service_provider_id uuid,       -- renamed from doctor_id (20260214)
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,

    CONSTRAINT clinic_rooms_pkey PRIMARY KEY (room_id),
    CONSTRAINT clinic_rooms_clinic_id_fkey FOREIGN KEY (clinic_id)
        REFERENCES public.clinics (clinic_id) ON DELETE CASCADE,

    -- FERRY FIX [CR1]: Original had FOREIGN KEY (doctor_id) but the column is
    -- service_provider_id. Fixed column reference and renamed constraint.
    CONSTRAINT clinic_rooms_service_provider_id_fkey FOREIGN KEY (service_provider_id)
        REFERENCES public.users (user_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_clinic_rooms_number
    ON public.clinic_rooms (clinic_id, room_number);


-- =========================================================================
-- 4. stations
-- =========================================================================
-- NEW table (not in 20260214).

-- QUESTION FOR ALAN [Q4]: stations has no clinic_id — is this intentional?
-- Option A: If stations are global templates shared across all clinics (e.g.,
--   'Triage', 'Pharmacy', 'Billing Counter', 'Consultation'), then this is fine
--   as-is. Each clinic maps its rooms to these global station types via
--   rooms_stations.
-- Option B: If each clinic has its own station definitions, we need to add:
--   clinic_id uuid NOT NULL + FK to clinics(clinic_id)
--   and change the unique constraint to (clinic_id, station_name).
-- Please clarify which model you intended.

-- Purpose: Workstation/consultation station types (e.g., Triage, Pharmacy, Billing).
CREATE TABLE IF NOT EXISTS public.stations (
    station_id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_name citext NOT NULL,
    station_desc character varying(500),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,

    CONSTRAINT stations_pkey PRIMARY KEY (station_id),
    CONSTRAINT uq_stations UNIQUE (station_name)
);  -- FERRY FIX [CR2]: Added missing semicolon


-- =========================================================================
-- 5. rooms_stations
-- =========================================================================
-- NEW table (not in 20260214).
-- Purpose: Many-to-many mapping between clinic rooms and stations.
-- Example: Room 1 at Clinic A has stations: Triage + Consultation.

-- QUESTION FOR ALAN [M2]: Consider adding clinic_id here for Row-Level Security.
-- Currently you'd need to JOIN through clinic_rooms to filter by clinic. Adding
-- clinic_id directly would be denormalized but helpful for RLS policies. Not
-- critical now but worth considering for the future.

CREATE TABLE IF NOT EXISTS public.rooms_stations (
    rooms_stations_id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    station_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,  -- FERRY FIX [CR3]: Added missing comma before CONSTRAINT

    CONSTRAINT rooms_stations_id_pkey PRIMARY KEY (rooms_stations_id),
    CONSTRAINT uq_rooms_stations UNIQUE (room_id, station_id),

    -- FERRY FIX [CR4]: Added FK constraints (were completely missing in original)
    CONSTRAINT rooms_stations_room_id_fkey FOREIGN KEY (room_id)
        REFERENCES public.clinic_rooms (room_id) ON DELETE CASCADE,
    CONSTRAINT rooms_stations_station_id_fkey FOREIGN KEY (station_id)
        REFERENCES public.stations (station_id) ON DELETE CASCADE
);  -- FERRY FIX [CR2]: Added missing semicolon

-- FERRY FIX [M1]: Added index on station_id for reverse lookups
-- ("which rooms have this station?")
CREATE INDEX IF NOT EXISTS idx_rooms_stations_station_id
    ON public.rooms_stations (station_id);


-- =========================================================================
-- 6. clinic_group
-- =========================================================================
-- NEW table (not in 20260214).
-- Purpose: Clinic chain/group registry (e.g., "HealthWay Medical Group"). Supports multi-group membership via
-- clinic_group_mapping.

CREATE TABLE IF NOT EXISTS public.clinic_group (
    clinic_group_id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_group_name citext NOT NULL,
    clinic_group_desc character varying(500),
    is_active boolean DEFAULT true,

    -- FERRY FIX [M6]: Added version for optimistic locking
    --version integer NOT NULL DEFAULT 1,  --  AY: not needed

    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,

    CONSTRAINT clinic_group_pkey PRIMARY KEY (clinic_group_id),
    CONSTRAINT uq_clinic_group UNIQUE (clinic_group_name)
);  -- FERRY FIX [CR2]: Added missing semicolon


-- =========================================================================
-- 7. clinic_group_mapping
-- =========================================================================
-- NEW table (not in 20260214).
-- Purpose: Many-to-many mapping between clinics and clinic groups.
-- A clinic can belong to multiple groups; a group can have multiple clinics.

CREATE TABLE IF NOT EXISTS public.clinic_group_mapping (
    clinic_group_mapping_id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_group_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,

    CONSTRAINT clinic_group_mapping_pkey PRIMARY KEY (clinic_group_mapping_id),
    CONSTRAINT uq_clinic_group_mapping UNIQUE (clinic_group_id, clinic_id),

    -- FERRY FIX: Added FK constraints (were missing in original)
    CONSTRAINT clinic_group_mapping_group_id_fkey FOREIGN KEY (clinic_group_id)
        REFERENCES public.clinic_group (clinic_group_id) ON DELETE CASCADE,
    CONSTRAINT clinic_group_mapping_clinic_id_fkey FOREIGN KEY (clinic_id)
        REFERENCES public.clinics (clinic_id) ON DELETE CASCADE
);  -- FERRY FIX [CR2]: Added missing semicolon

-- FERRY FIX [M1]: Added index on clinic_id for reverse lookups
-- ("which groups does this clinic belong to?")
CREATE INDEX IF NOT EXISTS idx_clinic_group_mapping_clinic_id
    ON public.clinic_group_mapping (clinic_id);


-- =========================================================================
-- 8. clinic_billing_details
-- =========================================================================
-- NEW table (not in 20260214).
-- Purpose: Payment routing and banking details for invoicing. Supports both
-- per-clinic and per-clinic-group billing via polymorphic ref_id/ref_type.
-- Singapore-specific: PayNow (UEN), GIRO, bank codes (DBS/OCBC/UOB).

-- NOTE [M7]: account_number_encrypted uses bytea. Ensure the application layer
-- uses a strong encryption method (e.g., pgcrypto pgp_sym_encrypt with
-- AES-256-GCM, or application-level encryption). The database should never store unencrypted account numbers. The account_number_last4 field allows for masked display without exposing sensitive data.

CREATE TABLE IF NOT EXISTS public.clinic_billing_details (
    -- FERRY FIX [H6]: Added NOT NULL (was missing in original — PKs should
    -- always be explicitly NOT NULL)
    billing_id uuid DEFAULT gen_random_uuid() NOT NULL,

    ref_id uuid NOT NULL,                                -- clinic_id or clinic_group_id

    -- FERRY FIX [H5]: Added NOT NULL + CHECK constraint on ref_type
    -- (was unchecked varchar in original)
    ref_type character varying(30) NOT NULL
        CHECK (ref_type IN ('CLINIC', 'CLINIC_GROUP')),  -- polymorphic discriminator

    status varchar(20) DEFAULT 'ACTIVE' NOT NULL
        CHECK (status IN ('ACTIVE', 'INACTIVE')),

    -- Banking
    bank_name varchar(200),
    bank_code varchar(10),                               -- SG bank code (e.g., DBS 7171)
    branch_code varchar(10),                             -- SG branch code (3 digits typical)
    account_holder_name varchar(200),
    account_number_encrypted bytea,                      -- store encrypted only (see NOTE above)
    account_number_last4 varchar(10),                    -- for masked UI display
    swift_bic varchar(11),
    iban varchar(34),

    giro_enabled boolean DEFAULT false,
    giro_reference varchar(100),

    -- PayNow Corporate
    paynow_type varchar(12) CHECK (paynow_type IN ('UEN', 'UEN_SUFFIX', 'MOBILE')),
    paynow_value varchar(64),                            -- e.g., UEN or mobile number
    paynow_qr_url text,

    -- Invoice presentation
    display_name varchar(200),                           -- appears on invoice footer
    remittance_advice_email varchar(200),
    invoice_footer_note text,

    -- FERRY FIX [M6]: Added version for optimistic locking
    -- version integer NOT NULL DEFAULT 1, --AY: Not needed

    -- Audit
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    modified_at timestamp with time zone,
    modified_by uuid,

    CONSTRAINT clinic_billing_details_pkey PRIMARY KEY (billing_id),
    CONSTRAINT uq_clinic_billing_details UNIQUE (ref_id, ref_type)
);

-- FERRY FIX [M1]: Added index on ref_type for filtering by CLINIC vs CLINIC_GROUP
CREATE INDEX IF NOT EXISTS idx_clinic_billing_ref_type
    ON public.clinic_billing_details (ref_type);


