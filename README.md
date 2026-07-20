# n8n-nodes-cobra-cxm

n8n community nodes for **cobra CXM WEB CONNECT** — the REST API of cobra Classic / cobra CXM.

They let an n8n workflow read and write cobra addresses, contacts and any other endpoint your
administrator has configured, search by email address or phone number, manage keywords,
documents and images, and react to new or changed records with a trigger.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/)
workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Nodes and operations](#nodes-and-operations)
- [Working with cobra endpoints](#working-with-cobra-endpoints)
- [Filtering and sorting](#filtering-and-sorting)
- [Pagination](#pagination)
- [Example workflows](#example-workflows)
- [Error handling](#error-handling)
- [Compatibility](#compatibility)
- [Development](#development)
- [Resources](#resources)

## Installation

### From the n8n GUI (self-hosted)

1. Go to **Settings → Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-cobra-cxm` and confirm that you understand the risks of installing
   community nodes.
4. Select **Install**.

Only instance owners and admins may install community nodes.

### Manually, from npm

```bash
# in your n8n user folder, by default ~/.n8n
cd ~/.n8n
mkdir -p nodes && cd nodes
npm install n8n-nodes-cobra-cxm
```

Restart n8n afterwards.

### Straight from GitHub

The package can be installed without npm at all. Every tagged release carries a
ready-built `.tgz` under
[Releases](https://github.com/p17-gmbh/n8n-nodes-cobra-cxm/releases) — download it, then:

```bash
cd ~/.n8n/nodes
npm install /path/to/n8n-nodes-cobra-cxm-0.1.0.tgz
```

Restart n8n afterwards.

Installing straight from the source tree (`npm install github:p17-gmbh/...`) does **not**
work on its own: community node packages must not ship a `prepare` script, because n8n
forbids lifecycle scripts that run code during installation. Without it nothing compiles
the TypeScript, so npm would install a package with no `dist/`. Build it yourself instead:

```bash
git clone https://github.com/p17-gmbh/n8n-nodes-cobra-cxm.git
cd n8n-nodes-cobra-cxm && npm install && npm run build && npm pack
# then install the resulting .tgz as shown above
```

Note that the n8n GUI installer accepts npm package names only, so these routes are
command line only.

### Docker

```bash
docker cp n8n-nodes-cobra-cxm-0.1.0.tgz n8n:/tmp/
docker exec -u node n8n sh -c \
  "mkdir -p /home/node/.n8n/nodes && cd /home/node/.n8n/nodes && npm install /tmp/n8n-nodes-cobra-cxm-0.1.0.tgz"
docker restart n8n
```

`/home/node/.n8n` must be a persistent volume, otherwise the node disappears on the next
container recreation.

## Credentials

Create a **Cobra CXM WEB CONNECT API** credential:

| Field | Description |
| --- | --- |
| **Base URL** | Server URL including protocol and port, e.g. `https://cobra.example.com:8443`. Do **not** append `/api` — the nodes do that. |
| **User Name** | cobra user name. |
| **Password** | Password of that cobra user. |
| **Ignore SSL Issues** | Enable only if the server uses a self-signed certificate. |

### How authentication works

cobra does not use static API keys. The credential posts your user name and password to
`POST /api/Token` and receives a JWT bearer token, which is then sent as
`Authorization: Bearer <token>` on every request.

**cobra bearer tokens are short-lived — roughly two minutes**, and there is no refresh token.
This is handled for you: n8n caches the token and automatically requests a new one whenever a
request comes back with `401`. You do not need to configure anything, but be aware that a very
long-running loop will silently re-authenticate along the way.

**Testing the credential** calls `GET /api/Health`. Because the token request runs first, a
wrong user name or password fails the test with a clear message, and a successful test also
proves that the cobra databases and the licence are reachable.

A `401` from cobra means *either* wrong credentials *or* invalid licence information — the API
does not distinguish between the two.

## Nodes and operations

### cobra CXM

| Resource | Operations |
| --- | --- |
| **Record** | Create, Delete, Get, Get Many, Update |
| **Linked Record** | Create, Get Many — e.g. the contacts of an address |
| **Search** | Search by Email (`MailSearch`), Search by Phone Number (`PhoneSearch`) |
| **Keyword** | Assign, Check, Get Many, Remove |
| **Document** | Delete, Download, Upload — cobra document management |
| **Image** | Delete, Download, Upload |
| **Metadata** | Get — field names, captions, types, sizes and selection lists of an endpoint |
| **Script** | Execute — a script/application configured on the server |
| **SQL** | Execute — an SQL command predefined by an administrator |
| **System** | Health Check |
| **User** | Create, Get, Get Many, Update, Add to Group, Remove From Group, Get Groups, Get Attributes, Update Attribute |
| **Group** | Create, Get, Get Many, Update |

The node is also available as an **AI tool**, so an AI Agent can look up or write cobra data.

### cobra CXM Trigger

Polls an endpoint and starts the workflow for records that appeared or changed since the last
run.

- **Event** — *Record Created* or *Record Updated*.
- **Timestamp Field** — the cobra date field to watch. Leave it empty and the node detects it
  from the endpoint metadata (cobra field type *DateCreated* / *DateModified*).
- **Options** — additional filter expression, limit per poll, and an overlap in seconds.

Notes on behaviour:

- The **first poll after activation only stores a watermark** and emits nothing. This prevents
  a freshly activated workflow from flooding you with the entire table.
- Records are emitted **oldest first**.
- Timestamps are rendered in the **workflow timezone**, because cobra compares against SQL
  Server `datetime` columns that hold local server time. Make sure the n8n timezone matches
  the cobra server, otherwise you will miss or duplicate records.
- If records written *while a poll was running* are occasionally missed, set
  **Overlap (Seconds)** to a few seconds. This may produce duplicates, so deduplicate
  downstream (for example with the *Remove Duplicates* node).

## Working with cobra endpoints

**`/api/Adressen` is only a sample.** In cobra CXM WEB CONNECT an administrator creates
endpoints and gives them arbitrary names, mapping each to a cobra table. There is no API that
lists the available endpoints, so every node asks you to type the **Endpoint** name.

Once you have typed a valid endpoint name, the node calls `GET /api/<Endpoint>/Metadata` and
populates the **Field** pickers with the real cobra field names and captions — including their
selection lists. If the picker stays empty, the endpoint name is wrong or the cobra user has
no access to it.

### Reads and writes use different shapes

This is the most surprising part of the cobra API, and the node hides it from you:

- **Reads** return plain JSON objects, e.g. `{ "ID": 1, "COMPANY1": "p17 GmbH" }`.
- **Writes** expect a list of name/value pairs, e.g.
  `[{ "name": "COMPANY1", "value": "p17 GmbH" }]`.

You always work with plain objects. For *Create* and *Update* pick a **Data Mode**:

| Data Mode | Use it when |
| --- | --- |
| **Define Below** | You want to pick fields from a dropdown fed by the endpoint metadata. |
| **JSON** | You want to pass an object such as `{ "COMPANY1": "p17 GmbH", "CITY": "Konstanz" }`. |
| **Auto-Map Input Data** | The incoming item already has cobra field names as keys. |

With *Auto-Map Input Data*, use **Options → Fields to Ignore** to strip read-only fields such
as `ID` or `DATECREATED`.

Prefer the internal field name (`COMPANY1`, `LASTNAME0`) over the display caption.

## Filtering and sorting

`FilterExpression` uses the **DevExpress criteria language**. Field names may be written bare
for simple identifiers, but wrap them in brackets when they contain spaces or umlauts —
`[Erfasst von]`. String literals use single quotes, and an embedded apostrophe is escaped by
doubling it.

| Goal | Expression |
| --- | --- |
| Equality | `Ort = 'Konstanz'` |
| Starts with | `Firma like 'A%'` |
| Contains | `Contains([Firma], 'GmbH')` |
| Escaped apostrophe | `Nachname = 'O''Neil'` |
| Date comparison | `Geburtstag >= #1990-01-01#` |
| Date range | `[Geburtstag] Between (#1980-01-01#, #1989-12-31#)` |
| Relative date | `[Aenderungsdatum] >= AddDays(LocalDateTimeToday(), -7)` |
| In a list | `Ort In ('Konstanz', 'Zürich', 'Wien')` |
| Null check | `Email Is Null` / `Email Is Not Null` |
| Empty or null | `IsNullOrEmpty([Email])` |
| Grouping | `(Ort = 'Konstanz' Or Ort = 'Zürich') And Firma like 'A%'` |
| Negation | `Not (Firma like 'Test%')` |
| Numeric range | `[Umsatz] > 10000 And [Umsatz] <= 50000` |

cobra adds its own keyword functions on top of the DevExpress language:

```
HasKeyword('Angebot')
HasKeywords('Aktion - Angebot', 'Marketing - Werbeaktion')
HasKeywordID(49)
HasKeywordID(49, 520, 336)
```

**Order By** takes a comma-separated list, e.g. `Firma DESC, Nachname ASC`.

## Pagination

- **Return All off** sends `Top` — a plain cap on the number of records.
- **Return All on** reads everything in a single request.
- **Return All on + Pagination → Page Size** fetches the records page by page and follows the
  pages automatically until a page comes back shorter than the requested size.

`Top` is never sent together with `Page Size`/`Page ID`, because cobra does not document how
the two interact.

> **Caution:** cobra does not document whether the first page is `PageId=0` or `PageId=1`, and
> it returns neither a total count nor a last-page marker. The paging loop therefore stops on
> the first short page and additionally aborts if the server hands back the same first record
> twice (which is what happens when `PageId` is ignored). Set **First Page ID** to `0` if your
> server turns out to be zero-based.

## Example workflows

**Find an address by email and add a note**

1. *cobra CXM* → Search → Search by Email, `{{ $json.from }}`, Search Mode `equals`.
2. *cobra CXM* → Linked Record → Create, Endpoint `Adressen`, Linked Endpoint `Kontakte`,
   Record ID `{{ $json.ID }}`.

**Sync new addresses into another system**

1. *cobra CXM Trigger* → Endpoint `Adressen`, Event *Record Created*.
2. Your target node.

**Upsert from a spreadsheet**

1. *cobra CXM* → Search → Search by Email to look for an existing record.
2. *If* → record found?
3. *cobra CXM* → Record → Update (Data Mode *Auto-Map Input Data*, Fields to Ignore `ID`)
   or Record → Create.

**Attach a generated PDF to an address**

1. Any node producing binary data.
2. *cobra CXM* → Document → Upload, Endpoint `Adressen`, Record ID, Document Field, and
   enable *Overwrite* if the document may already exist.

## Error handling

cobra reports failures in two different ways, and the node surfaces both as normal n8n errors:

- **HTTP status codes** — `401` authentication or licence, `404` not found, `405` the endpoint
  lacks the read/write/delete permission, `500` server error, `503` unhealthy.
- **Soft errors in a successful response.** A create can answer `HTTP 201` and still carry
  `errorMessage` and a numeric `errorType`. The node inspects every write result and fails the
  item with the cobra message plus a readable explanation of the error type, so a workflow
  never continues as if a rejected write had succeeded.

Enable **Settings → On Error → Continue** on the node if you would rather route failures to a
branch than stop the workflow.

The *System → Health Check* operation is deliberately tolerant: a `503` is returned as regular
data with `healthy: false` so a workflow can branch on it. Enable **Fail on Unhealthy** to turn
it into an error instead.

## Compatibility

- Requires **n8n 1.x or newer** (developed against n8n 2.x, `n8n-workflow` 2.16).
- Requires **Node.js 20.19** or newer.
- Targets the **cobra CXM WEB CONNECT API v2**.
- No runtime dependencies.

## Development

```bash
npm install
npm run dev     # starts n8n with this package loaded and hot reload
npm run lint
npm run build
```

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [cobra CXM WEB CONNECT documentation](https://webconnect.cobra-hilfe.de/docs/webconnect/uebersicht)
- [cobra Web API reference (SwaggerHub)](https://app.swaggerhub.com/apis-docs/cobraGmbH/cobraWebApi/v2)
- [DevExpress criteria language syntax](https://docs.devexpress.com/CoreLibraries/4928/devexpress-data-library/criteria-language-syntax)

## License

[MIT](LICENSE.md)

cobra and cobra CXM are trademarks of cobra GmbH. This project is an independent community
integration and is not affiliated with, endorsed by, or supported by cobra GmbH.
