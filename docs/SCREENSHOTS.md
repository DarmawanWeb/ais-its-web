# Screenshots

Gallery of every page of **AIS Maritime Intelligence**, grouped by the sidebar sections (Bahasa
Indonesia UI, mock gateway data). `pnpm screenshots` refreshes the images (every
`e2e/*screenshots.spec.ts`, 1440×900 desktop in the dark and light theme, 390×844 phone). Base
map tiles need internet access, so maps show the plain fallback background here.

## Sign-in (Masuk)

### Login

`/login`

| Desktop                          |
| -------------------------------- |
| ![Login ](screenshots/login.png) |

## Operations (Operasi)

### Live map: clusters, ship-type icons, safety rings, layer panel

`/map`

| Dark                                                                                                  | Light                                                                                                   | Mobile                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ![Live map: clusters, ship-type icons, safety rings, layer panel dark](screenshots/map-live-dark.png) | ![Live map: clusters, ship-type icons, safety rings, layer panel light](screenshots/map-live-light.png) | ![Live map: clusters, ship-type icons, safety rings, layer panel mobile](screenshots/map-live-mobile.png) |

### Live map: vessel panel with EWS, closest encounter and track playback

`/map?vessel=<mmsi>`

| Dark                                                                                                           | Light                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ![Live map: vessel panel with EWS, closest encounter and track playback dark](screenshots/map-vessel-dark.png) | ![Live map: vessel panel with EWS, closest encounter and track playback light](screenshots/map-vessel-light.png) |

### Alert inbox with filters, summary and live rows

`/alerts`

| Dark                                                                                       | Light                                                                                        | Mobile                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Alert inbox with filters, summary and live rows dark](screenshots/alerts-inbox-dark.png) | ![Alert inbox with filters, summary and live rows light](screenshots/alerts-inbox-light.png) | ![Alert inbox with filters, summary and live rows mobile](screenshots/alerts-inbox-mobile.png) |

### Alert detail: method, mini map, timeline, deliveries

`/alerts?alert=<id>`

| Dark                                                                                             | Light                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| ![Alert detail: method, mini map, timeline, deliveries dark](screenshots/alerts-detail-dark.png) | ![Alert detail: method, mini map, timeline, deliveries light](screenshots/alerts-detail-light.png) |

### Top bar bell: open alerts by severity

`top bar (every page)`

| Dark                                                                            | Light                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ![Top bar bell: open alerts by severity dark](screenshots/alerts-bell-dark.png) | ![Top bar bell: open alerts by severity light](screenshots/alerts-bell-light.png) |

## Safety (Keselamatan)

### Pipeline EWS: vessels near pipelines, corridors, event history

`/safety/ews`

| Dark                                                                                                    | Light                                                                                                     | Mobile                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ![Pipeline EWS: vessels near pipelines, corridors, event history dark](screenshots/safety-ews-dark.png) | ![Pipeline EWS: vessels near pipelines, corridors, event history light](screenshots/safety-ews-light.png) | ![Pipeline EWS: vessels near pipelines, corridors, event history mobile](screenshots/safety-ews-mobile.png) |

### Collision risk: encounters and risk bands

`/safety/collision`

| Dark                                                                                     | Light                                                                                      | Mobile                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| ![Collision risk: encounters and risk bands dark](screenshots/safety-collision-dark.png) | ![Collision risk: encounters and risk bands light](screenshots/safety-collision-light.png) | ![Collision risk: encounters and risk bands mobile](screenshots/safety-collision-mobile.png) |

### Encounter detail: CPA/TCPA history and both tracks

`/safety/collision?encounter=<id>`

| Dark                                                                                                     | Light                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ![Encounter detail: CPA/TCPA history and both tracks dark](screenshots/safety-collision-detail-dark.png) | ![Encounter detail: CPA/TCPA history and both tracks light](screenshots/safety-collision-detail-light.png) |

## Surveillance (Pengawasan)

### Overview: events per type, detectors, candidate queue

`/surveillance`

| Dark                                                                                                      | Light                                                                                                       | Mobile                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ![Overview: events per type, detectors, candidate queue dark](screenshots/surveillance-overview-dark.png) | ![Overview: events per type, detectors, candidate queue light](screenshots/surveillance-overview-light.png) | ![Overview: events per type, detectors, candidate queue mobile](screenshots/surveillance-overview-mobile.png) |

### Illegal transhipment events and analysis results

`/surveillance/transhipment`

| Dark                                                                                                     | Light                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ![Illegal transhipment events and analysis results dark](screenshots/surveillance-transhipment-dark.png) | ![Illegal transhipment events and analysis results light](screenshots/surveillance-transhipment-light.png) |

### Transhipment detail: pair replay, score, review

`/surveillance/transhipment/<eventId>`

| Dark                                                                                                           | Light                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ![Transhipment detail: pair replay, score, review dark](screenshots/surveillance-transhipment-detail-dark.png) | ![Transhipment detail: pair replay, score, review light](screenshots/surveillance-transhipment-detail-light.png) |

### Illegal fishing: loitering detections and heatmap

`/surveillance/fishing`

| Dark                                                                                                 | Light                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| ![Illegal fishing: loitering detections and heatmap dark](screenshots/surveillance-fishing-dark.png) | ![Illegal fishing: loitering detections and heatmap light](screenshots/surveillance-fishing-light.png) |

### Dark vessels: AIS gaps near harbours

`/surveillance/dark`

| Dark                                                                                 | Light                                                                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| ![Dark vessels: AIS gaps near harbours dark](screenshots/surveillance-dark-dark.png) | ![Dark vessels: AIS gaps near harbours light](screenshots/surveillance-dark-light.png) |

### Navstatus anomalies

`/surveillance/anomaly`

| Dark                                                                   | Light                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ![Navstatus anomalies dark](screenshots/surveillance-anomaly-dark.png) | ![Navstatus anomalies light](screenshots/surveillance-anomaly-light.png) |

## Fleet (Armada)

### Operations dashboard

`/dashboard`

| Dark                                                                  | Light                                                                   | Mobile                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ![Operations dashboard dark](screenshots/dashboard-overview-dark.png) | ![Operations dashboard light](screenshots/dashboard-overview-light.png) | ![Operations dashboard mobile](screenshots/dashboard-overview-mobile.png) |

### Fleet list

`/vessels`

| Dark                                                  | Light                                                   | Mobile                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| ![Fleet list dark](screenshots/vessels-list-dark.png) | ![Fleet list light](screenshots/vessels-list-light.png) | ![Fleet list mobile](screenshots/vessels-list-mobile.png) |

### Vessel detail: overview

`/vessels/<mmsi>`

| Dark                                                                 | Light                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Vessel detail: overview dark](screenshots/vessels-detail-dark.png) | ![Vessel detail: overview light](screenshots/vessels-detail-light.png) |

### Vessel detail: live position and safety state

`/vessels/<mmsi> (Live)`

| Dark                                                                                            | Light                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ![Vessel detail: live position and safety state dark](screenshots/vessels-detail-live-dark.png) | ![Vessel detail: live position and safety state light](screenshots/vessels-detail-live-light.png) |

### Vessel detail: CII

`/vessels/<mmsi> (CII)`

| Dark                                                                | Light                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![Vessel detail: CII dark](screenshots/vessels-detail-cii-dark.png) | ![Vessel detail: CII light](screenshots/vessels-detail-cii-light.png) |

### Vessel detail: telemetry

`/vessels/<mmsi> (Telemetri)`

| Dark                                                                            | Light                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ![Vessel detail: telemetry dark](screenshots/vessels-detail-telemetry-dark.png) | ![Vessel detail: telemetry light](screenshots/vessels-detail-telemetry-light.png) |

### Ship registry lookup

`/vessels/new (registry dialog)`

| Dark                                                                | Light                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![Ship registry lookup dark](screenshots/vessels-registry-dark.png) | ![Ship registry lookup light](screenshots/vessels-registry-light.png) |

### New vessel form

`/vessels/new`

| Dark                                                      | Light                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| ![New vessel form dark](screenshots/vessels-new-dark.png) | ![New vessel form light](screenshots/vessels-new-light.png) |

### Edit vessel

`/vessels/<mmsi>/edit`

| Dark                                                   | Light                                                    |
| ------------------------------------------------------ | -------------------------------------------------------- |
| ![Edit vessel dark](screenshots/vessels-edit-dark.png) | ![Edit vessel light](screenshots/vessels-edit-light.png) |

### Fleet CII overview

`/cii`

| Dark                                                       | Light                                                        | Mobile                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| ![Fleet CII overview dark](screenshots/cii-fleet-dark.png) | ![Fleet CII overview light](screenshots/cii-fleet-light.png) | ![Fleet CII overview mobile](screenshots/cii-fleet-mobile.png) |

### Vessel CII summary

`/cii/vessels/<mmsi>`

| Dark                                                        | Light                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| ![Vessel CII summary dark](screenshots/cii-vessel-dark.png) | ![Vessel CII summary light](screenshots/cii-vessel-light.png) |

### Vessel CII: daily cumulative curve

`/cii/vessels/<mmsi>`

| Dark                                                                              | Light                                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ![Vessel CII: daily cumulative curve dark](screenshots/cii-vessel-daily-dark.png) | ![Vessel CII: daily cumulative curve light](screenshots/cii-vessel-daily-light.png) |

### Vessel CII: annual history

`/cii/vessels/<mmsi> (Riwayat)`

| Dark                                                                 | Light                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Vessel CII: annual history dark](screenshots/cii-history-dark.png) | ![Vessel CII: annual history light](screenshots/cii-history-light.png) |

### Vessel CII: voyage segments

`/cii/vessels/<mmsi> (Segmen)`

| Dark                                                                   | Light                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ![Vessel CII: voyage segments dark](screenshots/cii-segments-dark.png) | ![Vessel CII: voyage segments light](screenshots/cii-segments-light.png) |

### Vessel CII: IMO DCS summary

`/cii/vessels/<mmsi> (DCS)`

| Dark                                                              | Light                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| ![Vessel CII: IMO DCS summary dark](screenshots/cii-dcs-dark.png) | ![Vessel CII: IMO DCS summary light](screenshots/cii-dcs-light.png) |

### Reduction factors Z

`/cii/reduction-factors`

| Dark                                                          | Light                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| ![Reduction factors Z dark](screenshots/cii-factors-dark.png) | ![Reduction factors Z light](screenshots/cii-factors-light.png) |

### SEEMP overview

`/seemp`

| Dark                                                        | Light                                                         | Mobile                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| ![SEEMP overview dark](screenshots/seemp-overview-dark.png) | ![SEEMP overview light](screenshots/seemp-overview-light.png) | ![SEEMP overview mobile](screenshots/seemp-overview-mobile.png) |

### SEEMP measure catalog

`/seemp (Langkah)`

| Dark                                                              | Light                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| ![SEEMP measure catalog dark](screenshots/seemp-catalog-dark.png) | ![SEEMP measure catalog light](screenshots/seemp-catalog-light.png) |

### Vessel SEEMP: baseline and recommendations

`/seemp/vessels/<mmsi>`

| Dark                                                                                  | Light                                                                                   |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ![Vessel SEEMP: baseline and recommendations dark](screenshots/seemp-vessel-dark.png) | ![Vessel SEEMP: baseline and recommendations light](screenshots/seemp-vessel-light.png) |

### Vessel SEEMP: simulation

`/seemp/vessels/<mmsi>`

| Dark                                                                    | Light                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ![Vessel SEEMP: simulation dark](screenshots/seemp-simulation-dark.png) | ![Vessel SEEMP: simulation light](screenshots/seemp-simulation-light.png) |

### SEEMP scenario comparison

`/seemp/vessels/<mmsi>`

| Dark                                                                  | Light                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![SEEMP scenario comparison dark](screenshots/seemp-compare-dark.png) | ![SEEMP scenario comparison light](screenshots/seemp-compare-light.png) |

### Telemetry readings explorer

`/telemetry`

| Dark                                                                         | Light                                                                          | Mobile                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| ![Telemetry readings explorer dark](screenshots/telemetry-explorer-dark.png) | ![Telemetry readings explorer light](screenshots/telemetry-explorer-light.png) | ![Telemetry readings explorer mobile](screenshots/telemetry-explorer-mobile.png) |

### Manual reading dialog

`/telemetry`

| Dark                                                                 | Light                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Manual reading dialog dark](screenshots/telemetry-manual-dark.png) | ![Manual reading dialog light](screenshots/telemetry-manual-light.png) |

## Settings (Pengaturan)

### Zone registry

`/zones`

| Dark                                                       | Light                                                        | Mobile                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| ![Zone registry dark](screenshots/zones-registry-dark.png) | ![Zone registry light](screenshots/zones-registry-light.png) | ![Zone registry mobile](screenshots/zones-registry-mobile.png) |

### Zone editor (terra-draw)

`/zones/<id>`

| Dark                                                                | Light                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![Zone editor (terra-draw) dark](screenshots/zones-editor-dark.png) | ![Zone editor (terra-draw) light](screenshots/zones-editor-light.png) |

### Alert rules

`/alert-rules`

| Dark                                                        | Light                                                         | Mobile                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| ![Alert rules dark](screenshots/alert-rules-rules-dark.png) | ![Alert rules light](screenshots/alert-rules-rules-light.png) | ![Alert rules mobile](screenshots/alert-rules-rules-mobile.png) |

### Alert rule editor

`/alert-rules`

| Dark                                                               | Light                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| ![Alert rule editor dark](screenshots/alert-rules-editor-dark.png) | ![Alert rule editor light](screenshots/alert-rules-editor-light.png) |

### Delivery history

`/alert-rules`

| Dark                                                                  | Light                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![Delivery history dark](screenshots/alert-rules-deliveries-dark.png) | ![Delivery history light](screenshots/alert-rules-deliveries-light.png) |

### Webhook signature guide

`/alert-rules`

| Dark                                                                      | Light                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| ![Webhook signature guide dark](screenshots/alert-rules-webhook-dark.png) | ![Webhook signature guide light](screenshots/alert-rules-webhook-light.png) |

### Organizations

`/admin/organizations`

| Dark                                                            | Light                                                             | Mobile                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| ![Organizations dark](screenshots/admin-organizations-dark.png) | ![Organizations light](screenshots/admin-organizations-light.png) | ![Organizations mobile](screenshots/admin-organizations-mobile.png) |

### User directory

`/admin/organizations (Pengguna)`

| Dark                                                     | Light                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| ![User directory dark](screenshots/admin-users-dark.png) | ![User directory light](screenshots/admin-users-light.png) |

### Members and invitations

`/admin/members`

| Dark                                                                | Light                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![Members and invitations dark](screenshots/admin-members-dark.png) | ![Members and invitations light](screenshots/admin-members-light.png) |

### Invite a member

`/admin/members`

| Dark                                                               | Light                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| ![Invite a member dark](screenshots/admin-members-invite-dark.png) | ![Invite a member light](screenshots/admin-members-invite-light.png) |

### API keys

`/admin/api-keys`

| Dark                                                  | Light                                                   |
| ----------------------------------------------------- | ------------------------------------------------------- |
| ![API keys dark](screenshots/admin-api-keys-dark.png) | ![API keys light](screenshots/admin-api-keys-light.png) |

### API key secret shown once

`/admin/api-keys`

| Dark                                                                          | Light                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ![API key secret shown once dark](screenshots/admin-api-keys-secret-dark.png) | ![API key secret shown once light](screenshots/admin-api-keys-secret-light.png) |

### Fleet reference data

`/admin/reference-data`

| Dark                                                                    | Light                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ![Fleet reference data dark](screenshots/admin-reference-data-dark.png) | ![Fleet reference data light](screenshots/admin-reference-data-light.png) |

### Fuel formula editor

`/admin/reference-data?tab=formulas`

| Dark                                                                      | Light                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| ![Fuel formula editor dark](screenshots/admin-reference-formula-dark.png) | ![Fuel formula editor light](screenshots/admin-reference-formula-light.png) |

### Telemetry devices

`/admin/devices`

| Dark                                                          | Light                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| ![Telemetry devices dark](screenshots/admin-devices-dark.png) | ![Telemetry devices light](screenshots/admin-devices-light.png) |

### Device connection guide

`/admin/devices`

| Dark                                                                           | Light                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| ![Device connection guide dark](screenshots/admin-devices-connection-dark.png) | ![Device connection guide light](screenshots/admin-devices-connection-light.png) |

### Audit log

`/admin/audit-log`

| Dark                                                    | Light                                                     |
| ------------------------------------------------------- | --------------------------------------------------------- |
| ![Audit log dark](screenshots/admin-audit-log-dark.png) | ![Audit log light](screenshots/admin-audit-log-light.png) |

### Audit record detail

`/admin/audit-log`

| Dark                                                                 | Light                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Audit record detail dark](screenshots/admin-audit-detail-dark.png) | ![Audit record detail light](screenshots/admin-audit-detail-light.png) |

## Knowledge (Pengetahuan)

### Methodology catalog

`/methodology`

| Dark                                                                  | Light                                                                   | Mobile                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ![Methodology catalog dark](screenshots/methodology-catalog-dark.png) | ![Methodology catalog light](screenshots/methodology-catalog-light.png) | ![Methodology catalog mobile](screenshots/methodology-catalog-mobile.png) |

### Method card (deep link)

`/methodology#<methodId>`

| Dark                                                                     | Light                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| ![Method card (deep link) dark](screenshots/methodology-method-dark.png) | ![Method card (deep link) light](screenshots/methodology-method-light.png) |

### Bibliography

`/methodology#bibliography`

| Dark                                                                | Light                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![Bibliography dark](screenshots/methodology-bibliography-dark.png) | ![Bibliography light](screenshots/methodology-bibliography-light.png) |

## User menu (Menu pengguna)

### Profile and security

`/profile`

| Dark                                                                | Light                                                                 | Mobile                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![Profile and security dark](screenshots/profile-overview-dark.png) | ![Profile and security light](screenshots/profile-overview-light.png) | ![Profile and security mobile](screenshots/profile-overview-mobile.png) |

### Two-factor setup

`/profile`

| Dark                                                       | Light                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| ![Two-factor setup dark](screenshots/profile-mfa-dark.png) | ![Two-factor setup light](screenshots/profile-mfa-light.png) |
