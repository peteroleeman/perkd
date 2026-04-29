# Postman Testing Guide - Kaotim Activity Log API

## Prerequisites

1. **Server Running**: Make sure your server is running on the correct port (default: 8080)
2. **Postman Installed**: Download from [postman.com](https://www.postman.com/downloads/)
3. **Base URL**: `http://localhost:8080` (or your deployed server URL)

---

## Quick Start

### Step 1: Start Your Server

```bash
# Navigate to your project directory
cd "c:\Users\choonlee\myTestProject\perkd - Copy"

# Start the server
node server.js
```

You should see: `Magic happens on port 8080`

---

## Testing Each Endpoint

### 1. Test API Info (GET Request)

**Purpose**: Verify the API is running

**Method**: `GET`  
**URL**: `http://localhost:8080/kaotimlog/about`

**Steps in Postman**:
1. Create a new request
2. Set method to `GET`
3. Enter URL: `http://localhost:8080/kaotimlog/about`
4. Click **Send**

**Expected Response**:
```json
{
  "version": "1.0.0",
  "service": "Kaotim Activity Log API"
}
```

**Status Code**: `200 OK`

---

### 2. Query BigQuery (All Raw Data)

**Purpose**: Get raw BigQuery data with pagination

**Method**: `POST`  
**URL**: `http://localhost:8080/kaotimlog/querybigquery`

**Steps in Postman**:
1. Create a new request
2. Set method to `POST`
3. Enter URL: `http://localhost:8080/kaotimlog/querybigquery`
4. Go to **Body** tab
5. Select **raw** and **JSON** format
6. Enter the following JSON:

```json
{
  "limit": 10,
  "offset": 0
}
```

7. Click **Send**

**Expected Response**:
```json
{
  "success": true,
  "count": 10,
  "total": 150,
  "offset": 0,
  "limit": 10,
  "storeId": null,
  "hasMore": true,
  "nextOffset": 10,
  "data": [
    {
      "timestamp": "2026-01-19 01:34:32.939208 UTC",
      "event_id": "eb831099-b6f9-4535-920d-d2285f1c379b",
      "document_name": "projects/foodio-ab3b2/databases/(default)/documents/kaotim_hq/S_xxx/activity_log/xxx",
      "operation": "CREATE",
      "data": "{...}",
      "document_id": "30gAya25qBAWfvUcsRke"
    }
  ]
}
```

**Variations to Test**:

**With Store ID Filter**:
```json
{
  "limit": 10,
  "offset": 0,
  "storeid": "S_66c7439d-720d-4287-a719-989ec1879df4"
}
```

**Pagination (Next Page)**:
```json
{
  "limit": 10,
  "offset": 10
}
```

---

### 3. Query Raw Data (Parsed)

**Purpose**: Get parsed activity log data (recommended for most use cases)

**Method**: `POST`  
**URL**: `http://localhost:8080/kaotimlog/queryrawdata`

**Steps in Postman**:
1. Create a new request
2. Set method to `POST`
3. Enter URL: `http://localhost:8080/kaotimlog/queryrawdata`
4. Go to **Body** tab → **raw** → **JSON**
5. Enter:

```json
{
  "limit": 5,
  "offset": 0
}
```

6. Click **Send**

**Expected Response**:
```json
{
  "success": true,
  "count": 5,
  "total": 150,
  "offset": 0,
  "limit": 5,
  "hasMore": true,
  "nextOffset": 5,
  "data": [
    {
      "id": "30gAya25qBAWfvUcsRke",
      "timestamp": "2026-01-19 01:34:32.939208 UTC",
      "activityType": "submit_stock_take",
      "description": "Submitted stock take for 2026-01-19",
      "storeId": "S_66c7439d-720d-4287-a719-989ec1879df4",
      "userId": "FU_+60129421101",
      "userName": "+60129421101",
      "userPhone": "+60129421101",
      "userEmail": "pp@p.com",
      "data": {
        "date": "2026-01-19",
        "totalItems": 3,
        "totalWastage": 0
      }
    }
  ]
}
```

**With Store Filter**:
```json
{
  "limit": 5,
  "offset": 0,
  "storeid": "S_66c7439d-720d-4287-a719-989ec1879df4"
}
```

---

### 4. Query by Days

**Purpose**: Get activity logs from the last N days

**Method**: `POST`  
**URL**: `http://localhost:8080/kaotimlog/querybydays`

**Steps in Postman**:
1. Create a new request
2. Set method to `POST`
3. Enter URL: `http://localhost:8080/kaotimlog/querybydays`
4. Go to **Body** tab → **raw** → **JSON**
5. Enter:

```json
{
  "days": 7,
  "limit": 20,
  "offset": 0
}
```

6. Click **Send**

**Expected Response**:
```json
{
  "success": true,
  "count": 20,
  "total": 85,
  "offset": 0,
  "limit": 20,
  "days": 7,
  "storeId": null,
  "hasMore": true,
  "nextOffset": 20,
  "data": [...]
}
```

**Variations**:

**Last 1 day**:
```json
{
  "days": 1,
  "limit": 50
}
```

**Last 30 days for specific store**:
```json
{
  "days": 30,
  "limit": 100,
  "storeid": "S_66c7439d-720d-4287-a719-989ec1879df4"
}
```

**Error Test (Invalid days)**:
```json
{
  "days": 0,
  "limit": 10
}
```

Expected Error Response:
```json
{
  "success": false,
  "message": "Invalid days parameter. Days must be a number and at least 1.",
  "error": "Days parameter is required and must be >= 1"
}
```

---

### 5. Query by Activity Type

**Purpose**: Filter logs by specific activity type

**Method**: `POST`  
**URL**: `http://localhost:8080/kaotimlog/querybyactivitytype`

**Steps in Postman**:
1. Create a new request
2. Set method to `POST`
3. Enter URL: `http://localhost:8080/kaotimlog/querybyactivitytype`
4. Go to **Body** tab → **raw** → **JSON**
5. Enter:

```json
{
  "activityType": "submit_stock_take",
  "limit": 10,
  "offset": 0
}
```

6. Click **Send**

**Expected Response**:
```json
{
  "success": true,
  "count": 10,
  "total": 45,
  "offset": 0,
  "limit": 10,
  "activityType": "submit_stock_take",
  "storeId": null,
  "hasMore": true,
  "nextOffset": 10,
  "data": [...]
}
```

**Test Different Activity Types**:

**Credit Top-up Success**:
```json
{
  "activityType": "topup_credit_passed",
  "limit": 10
}
```

**Credit Top-up Failed**:
```json
{
  "activityType": "topup_credit_failed",
  "limit": 10
}
```

**Place Reorder**:
```json
{
  "activityType": "place_reorder",
  "limit": 10
}
```

**Accept Reorder**:
```json
{
  "activityType": "accept_reorder",
  "limit": 10
}
```

**Request Transfer**:
```json
{
  "activityType": "request_transfer",
  "limit": 10
}
```

**Accept Transfer**:
```json
{
  "activityType": "accept_transfer",
  "limit": 10
}
```

**Reject Transfer**:
```json
{
  "activityType": "reject_transfer",
  "limit": 10
}
```

**With Store Filter**:
```json
{
  "activityType": "submit_stock_take",
  "limit": 10,
  "storeid": "S_66c7439d-720d-4287-a719-989ec1879df4"
}
```

**Error Test (Missing activity type)**:
```json
{
  "limit": 10
}
```

Expected Error Response:
```json
{
  "success": false,
  "message": "Activity type parameter is required",
  "error": "activityType parameter is missing"
}
```

---

### 6. Query by Date Range

**Purpose**: Get logs within a specific date range

**Method**: `POST`  
**URL**: `http://localhost:8080/kaotimlog/querybydaterange`

**Steps in Postman**:
1. Create a new request
2. Set method to `POST`
3. Enter URL: `http://localhost:8080/kaotimlog/querybydaterange`
4. Go to **Body** tab → **raw** → **JSON**
5. Enter:

```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-19",
  "limit": 20,
  "offset": 0
}
```

6. Click **Send**

**Expected Response**:
```json
{
  "success": true,
  "count": 20,
  "total": 120,
  "offset": 0,
  "limit": 20,
  "startDate": "2026-01-01",
  "endDate": "2026-01-19",
  "storeId": null,
  "hasMore": true,
  "nextOffset": 20,
  "data": [...]
}
```

**Variations**:

**Single Day**:
```json
{
  "startDate": "2026-01-19",
  "endDate": "2026-01-19",
  "limit": 50
}
```

**With Store Filter**:
```json
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "limit": 100,
  "storeid": "S_66c7439d-720d-4287-a719-989ec1879df4"
}
```

**Error Test (Missing dates)**:
```json
{
  "limit": 10
}
```

Expected Error Response:
```json
{
  "success": false,
  "message": "Start date and end date are required",
  "error": "startDate and endDate parameters are missing"
}
```

---

## Creating a Postman Collection

### Step-by-Step Guide:

1. **Create New Collection**:
   - Click **Collections** in left sidebar
   - Click **New Collection**
   - Name it: `Kaotim Activity Log API`

2. **Add Requests to Collection**:
   - Click **Add Request** in the collection
   - Name each request (e.g., "Get API Info", "Query Raw Data", etc.)
   - Configure each request as shown above

3. **Set Collection Variables**:
   - Click on the collection
   - Go to **Variables** tab
   - Add variables:
     - `baseUrl`: `http://localhost:8080`
     - `storeid`: `S_66c7439d-720d-4287-a719-989ec1879df4`

4. **Use Variables in Requests**:
   - URL: `{{baseUrl}}/kaotimlog/queryrawdata`
   - Body: `{"storeid": "{{storeid}}"}`

---

## Sample Postman Collection JSON

Save this as a `.json` file and import into Postman:

```json
{
  "info": {
    "name": "Kaotim Activity Log API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get API Info",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/kaotimlog/about",
          "host": ["{{baseUrl}}"],
          "path": ["kaotimlog", "about"]
        }
      }
    },
    {
      "name": "Query Raw Data",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"limit\": 10,\n  \"offset\": 0\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/kaotimlog/queryrawdata",
          "host": ["{{baseUrl}}"],
          "path": ["kaotimlog", "queryrawdata"]
        }
      }
    },
    {
      "name": "Query by Days",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"days\": 7,\n  \"limit\": 20,\n  \"offset\": 0\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/kaotimlog/querybydays",
          "host": ["{{baseUrl}}"],
          "path": ["kaotimlog", "querybydays"]
        }
      }
    },
    {
      "name": "Query by Activity Type",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"activityType\": \"submit_stock_take\",\n  \"limit\": 10,\n  \"offset\": 0\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/kaotimlog/querybyactivitytype",
          "host": ["{{baseUrl}}"],
          "path": ["kaotimlog", "querybyactivitytype"]
        }
      }
    },
    {
      "name": "Query by Date Range",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"startDate\": \"2026-01-01\",\n  \"endDate\": \"2026-01-19\",\n  \"limit\": 20,\n  \"offset\": 0\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/kaotimlog/querybydaterange",
          "host": ["{{baseUrl}}"],
          "path": ["kaotimlog", "querybydaterange"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:8080"
    },
    {
      "key": "storeid",
      "value": "S_66c7439d-720d-4287-a719-989ec1879df4"
    }
  ]
}
```

---

## Troubleshooting

### Common Issues:

**1. Connection Refused**
- **Problem**: `Error: connect ECONNREFUSED`
- **Solution**: Make sure server is running (`node server.js`)

**2. 404 Not Found**
- **Problem**: Endpoint not found
- **Solution**: Check URL spelling, ensure router is registered in `server.js`

**3. 500 Internal Server Error**
- **Problem**: Server error
- **Solution**: Check server console for error messages, verify BigQuery credentials

**4. Empty Data Array**
- **Problem**: `data: []` in response
- **Solution**: Check if data exists in BigQuery table, verify store ID

**5. BigQuery Authentication Error**
- **Problem**: BigQuery query fails
- **Solution**: 
  - Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable
  - Or set `GOOGLE_SERVICE_ACCOUNT_KEY` with JSON credentials
  - Verify service account has BigQuery permissions

---

## Testing Checklist

- [ ] Server starts without errors
- [ ] GET `/kaotimlog/about` returns version info
- [ ] POST `/kaotimlog/querybigquery` returns data
- [ ] POST `/kaotimlog/queryrawdata` returns parsed data
- [ ] POST `/kaotimlog/querybydays` with valid days works
- [ ] POST `/kaotimlog/querybydays` with invalid days returns error
- [ ] POST `/kaotimlog/querybyactivitytype` with valid type works
- [ ] POST `/kaotimlog/querybyactivitytype` without type returns error
- [ ] POST `/kaotimlog/querybydaterange` with valid dates works
- [ ] POST `/kaotimlog/querybydaterange` without dates returns error
- [ ] Pagination works (offset/limit)
- [ ] Store ID filtering works
- [ ] All activity types can be queried

---

## Next Steps

1. **Save Collection**: Export your Postman collection for team sharing
2. **Environment Setup**: Create separate environments for dev/staging/production
3. **Automated Tests**: Add Postman tests to validate responses
4. **Documentation**: Use Postman's built-in documentation feature

Happy Testing! 🚀
