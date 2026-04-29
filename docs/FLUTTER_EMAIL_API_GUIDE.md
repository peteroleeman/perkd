# Flutter Guide: Calling Email API Endpoints

This guide explains how to call all email router functions from a Flutter project.

## 1. Add Dependencies

Add to `pubspec.yaml`:

```yaml
dependencies:
  http: ^1.1.0  # or dio: ^5.4.0
```

## 2. Base URL

The email router is mounted at `/email`. Use:

```
https://api.foodio.online/email
```

---

## 3. API Service Class (using `http` package)

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class EmailApiService {
  final String baseUrl;

  EmailApiService({required this.baseUrl});

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final url = Uri.parse('$baseUrl$path');
    final response = await http.post(
      url,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  // ---------------------------------------------------------------------------
  // 1. TRIGGER-COLLECT (single item) → sends to receiver_email
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> triggerCollect({
    required String subject,
    required String receiverEmail,
    required String collectionCode,
    String? senderName,
    String? senderEmail,
    String? receiverName,
    String? itemName,
    String? scheduleDate,
    String? remark,
    String? imageUrl,
    String? collectionCode,
    String? storeTitle,
    String? storeAddress,
  }) async {
    return _post('/trigger-collect', {
      'subject': subject,
      'template_data': {
        'receiver_email': receiverEmail,
        if (senderName != null) 'sender_name': senderName,
        if (senderEmail != null) 'sender_email': senderEmail,
        if (receiverName != null) 'receiver_name': receiverName,
        if (itemName != null) 'item_name': itemName,
        if (scheduleDate != null) 'schedule_date': scheduleDate,
        if (remark != null) 'remark': remark,
        if (imageUrl != null) 'image_url': imageUrl,
        'collection_code': collectionCode,
        if (storeTitle != null) 'store_title': storeTitle,
        if (storeAddress != null) 'store_address': storeAddress,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. TRIGGER-COLLECTMANY (multiple items) → sends to receiver_email
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> triggerCollectMany({
    required String subject,
    required String receiverEmail,
    required List<Map<String, dynamic>> items,
    required String collectionCode,
    String? senderName,
    String? senderEmail,
    String? receiverName,
    String? scheduleDate,
    String? remark,
    String? storeTitle,
    String? storeAddress,
  }) async {
    return _post('/trigger-collectmany', {
      'subject': subject,
      'template_data': {
        'receiver_email': receiverEmail,
        'items': items,
        if (senderName != null) 'sender_name': senderName,
        if (senderEmail != null) 'sender_email': senderEmail,
        if (receiverName != null) 'receiver_name': receiverName,
        if (scheduleDate != null) 'schedule_date': scheduleDate,
        if (remark != null) 'remark': remark,
        'collection_code': collectionCode,
        if (storeTitle != null) 'store_title': storeTitle,
        if (storeAddress != null) 'store_address': storeAddress,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 3. TRIGGER-GIFTRECEIPT → sends to sender_email
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> triggerGiftReceipt({
    required String subject,
    required String senderEmail,
    String? senderName,
    String? receiverName,
    String? receiverAddress,
    List<Map<String, dynamic>>? items,
    String? collectionCode,
    String? storeTitle,
    String? storeAddress,
  }) async {
    return _post('/trigger-giftreceipt', {
      'subject': subject,
      'template_data': {
        'sender_email': senderEmail,
        if (senderName != null) 'sender_name': senderName,
        if (receiverName != null) 'receiver_name': receiverName,
        if (receiverAddress != null) 'receiver_address': receiverAddress,
        if (items != null) 'items': items,
        if (collectionCode != null) 'collection_code': collectionCode,
        if (storeTitle != null) 'store_title': storeTitle,
        if (storeAddress != null) 'store_address': storeAddress,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 4. TRIGGER-COLLECTED → sends to sender_email (requires collection_date, collection_time)
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> triggerCollected({
    required String subject,
    required String senderEmail,
    required String collectionDate,
    required String collectionTime,
    String? senderName,
    String? receiverName,
    String? collectionCode,
    List<Map<String, dynamic>>? items,
    String? storeTitle,
    String? storeAddress,
  }) async {
    return _post('/trigger-collected', {
      'subject': subject,
      'template_data': {
        'sender_email': senderEmail,
        'collection_date': collectionDate,
        'collection_time': collectionTime,
        if (senderName != null) 'sender_name': senderName,
        if (receiverName != null) 'receiver_name': receiverName,
        if (collectionCode != null) 'collection_code': collectionCode,
        if (items != null) 'items': items,
        if (storeTitle != null) 'store_title': storeTitle,
        if (storeAddress != null) 'store_address': storeAddress,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 5. TRIGGER-CANCELRECEIPT → sends to sender_email (requires cancellation_date, cancellation_time)
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> triggerCancelReceipt({
    required String subject,
    required String senderEmail,
    required String cancellationDate,
    required String cancellationTime,
    String? senderName,
    String? receiverName,
    String? receiverAddress,
    List<Map<String, dynamic>>? items,
    String? collectionCode,
    String? storeTitle,
    String? storeAddress,
  }) async {
    return _post('/trigger-cancelreceipt', {
      'subject': subject,
      'template_data': {
        'sender_email': senderEmail,
        'cancellation_date': cancellationDate,
        'cancellation_time': cancellationTime,
        if (senderName != null) 'sender_name': senderName,
        if (receiverName != null) 'receiver_name': receiverName,
        if (receiverAddress != null) 'receiver_address': receiverAddress,
        if (items != null) 'items': items,
        if (collectionCode != null) 'collection_code': collectionCode,
        if (storeTitle != null) 'store_title': storeTitle,
        if (storeAddress != null) 'store_address': storeAddress,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 6. TRIGGER-CANCEL-COLLECTION → sends to receiver_email (requires cancellation_date, cancellation_time)
  // ---------------------------------------------------------------------------
  Future<Map<String, dynamic>> triggerCancelCollection({
    required String subject,
    required String receiverEmail,
    required String cancellationDate,
    required String cancellationTime,
    String? senderName,
    String? receiverName,
    List<Map<String, dynamic>>? items,
    String? storeTitle,
    String? storeAddress,
  }) async {
    return _post('/trigger-cancel-collection', {
      'subject': subject,
      'template_data': {
        'receiver_email': receiverEmail,
        'cancellation_date': cancellationDate,
        'cancellation_time': cancellationTime,
        if (senderName != null) 'sender_name': senderName,
        if (receiverName != null) 'receiver_name': receiverName,
        if (items != null) 'items': items,
        if (storeTitle != null) 'store_title': storeTitle,
        if (storeAddress != null) 'store_address': storeAddress,
      },
    });
  }
}
```

---

## 4. Usage Examples

```dart
final emailApi = EmailApiService(baseUrl: 'https://api.foodio.online/email');

// 1. Send collection email (single item) to receiver
final result1 = await emailApi.triggerCollect(
  subject: 'Please collect your item',
  receiverEmail: 'jordan@example.com',
  collectionCode: '847291',
  senderName: 'Alex',
  senderEmail: 'alex@example.com',
  receiverName: 'Jordan',
  itemName: 'Golden Perch Aglio Olio',
  scheduleDate: '15 March 2026',
  remark: 'Happy birthday!',
  storeTitle: 'RealBites',
  storeAddress: '45 Jalan Sultan, KL',
);
// Returns: { success: true, messageId: '...', to: '...', subject: '...', collection_code: '847291' }

// 2. Send collection email (multiple items) to receiver
final result2 = await emailApi.triggerCollectMany(
  subject: 'Please collect your items',
  receiverEmail: 'jordan@example.com',
  collectionCode: '847291',
  items: [
    {'item_name': 'Golden Perch Aglio Olio', 'image_url': 'https://...', 'quantity': 2},
    {'item_name': 'Coffee', 'quantity': 1},
  ],
  senderName: 'Alex',
  senderEmail: 'alex@example.com',
  receiverName: 'Jordan',
  scheduleDate: '15 March 2026',
);

// 3. Send gift receipt to sender (after sending collection to receiver)
await emailApi.triggerGiftReceipt(
  subject: 'Your gift purchase receipt',
  senderEmail: 'alex@example.com',
  senderName: 'Alex',
  receiverName: 'Jordan',
  receiverAddress: '456 Receiver Road, KL',
  collectionCode: result1['collection_code'],
  items: [
    {'item_name': 'Golden Perch Aglio Olio', 'quantity': 2},
  ],
);

// 4. Notify sender that receiver collected (call when receiver picks up)
await emailApi.triggerCollected(
  subject: 'Your gift has been collected',
  senderEmail: 'alex@example.com',
  collectionDate: '15 March 2026',
  collectionTime: '2:30 PM',
  senderName: 'Alex',
  receiverName: 'Jordan',
  collectionCode: '847291',
  storeTitle: 'RealBites',
  storeAddress: '45 Jalan Sultan, KL',
);

// 5. Send cancel receipt to sender (when gift is canceled)
await emailApi.triggerCancelReceipt(
  subject: 'Your gift has been canceled',
  senderEmail: 'alex@example.com',
  cancellationDate: '15 March 2026',
  cancellationTime: '10:45 AM',
  senderName: 'Alex',
  receiverName: 'Jordan',
  items: [{'item_name': 'Golden Perch', 'quantity': 2}],
);

// 6. Inform receiver that gift was canceled by sender
await emailApi.triggerCancelCollection(
  subject: 'Your gift has been canceled',
  receiverEmail: 'jordan@example.com',
  cancellationDate: '15 March 2026',
  cancellationTime: '10:45 AM',
  senderName: 'Alex',
  receiverName: 'Jordan',
  items: [{'item_name': 'Golden Perch', 'quantity': 2}],
);
```

---

## 5. Quick Reference

| Endpoint | Sends to | Required in template_data |
|----------|----------|---------------------------|
| `POST /trigger-collect` | receiver_email | receiver_email, collection_code |
| `POST /trigger-collectmany` | receiver_email | receiver_email, items, collection_code |
| `POST /trigger-giftreceipt` | sender_email | sender_email |
| `POST /trigger-collected` | sender_email | sender_email, collection_date, collection_time |
| `POST /trigger-cancelreceipt` | sender_email | sender_email, cancellation_date, cancellation_time |
| `POST /trigger-cancel-collection` | receiver_email | receiver_email, cancellation_date, cancellation_time |

### Collection code format

- **QR code**: Encodes the full `collection_code` you provide (e.g. `ABC_123456`).
- **Display**: The email shows only the part after the last `_` (e.g. `123456`).
- If there is no underscore, the full code is displayed.
- Example: `collection_code: 'STORE_847291'` → QR contains `STORE_847291`, display shows `847291`.

---

## 6. Error Handling

```dart
try {
  final result = await emailApi.triggerCollect(...);
  if (result['success'] == true) {
    // Success: use result['messageId'], result['collection_code'] etc.
  } else {
    // Error: result['error'] contains message
    print(result['error']);
  }
} catch (e) {
  // Network or parse error
  print('Request failed: $e');
}
```

---

## 7. Items Format

For `trigger-collectmany`, `trigger-giftreceipt`, `trigger-collected`, `trigger-cancelreceipt`, `trigger-cancel-collection`:

```dart
[
  {'item_name': 'Golden Perch Aglio Olio', 'quantity': 2, 'image_url': 'https://...'},  // image_url optional for collectmany
  {'item_name': 'Coffee', 'quantity': 1},
]
```
