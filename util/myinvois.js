/**
 * Utility functions for MyInvois API operations
 */

/**
 * Parse the response from submitDocument API call
 * @param {Object} response - The response object from submitDocument
 * @returns {Object} Parsed result with success, uuid, invoiceCodeNumber, submissionUid, and error fields
 */
function parseSubmitDocumentResponse(response) {
  const result = {
    success: false,
    uuid: '',
    invoiceCodeNumber: '',
    submissionUid: '',
    error: ''
  };

  try {
    console.log('parseSubmitDocumentResponse - Input response:', JSON.stringify(response, null, 2));
    console.log('parseSubmitDocumentResponse - Response keys:', Object.keys(response));
    
    // Check if response indicates success
    const isSuccess = response['success'] === true;
    result['success'] = isSuccess;
    
    console.log('parseSubmitDocumentResponse - isSuccess:', isSuccess);
    
    if (isSuccess) {
      // Handle successful response
      let data = response['data'];
      console.log('parseSubmitDocumentResponse - data type:', typeof data);
      console.log('parseSubmitDocumentResponse - data:', JSON.stringify(data, null, 2));
      
      // If data is a string, try to parse it as JSON
      if (typeof data === 'string' && data.length > 0) {
        try {
          data = JSON.parse(data);
          console.log('parseSubmitDocumentResponse - Parsed data from string:', JSON.stringify(data, null, 2));
        } catch (e) {
          console.log('parseSubmitDocumentResponse - Error parsing data string:', e);
        }
      }
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Convert to plain object if needed
        let dataMap = data;
        
        // Ensure it's a plain object
        if (data.constructor !== Object) {
          dataMap = Object.assign({}, data);
        }
        
        console.log('parseSubmitDocumentResponse - dataMap keys:', Object.keys(dataMap));
        
        // Check if dataMap has nested 'data' key (some APIs return {success: true, data: {data: {...}}})
        if (dataMap.hasOwnProperty('data') && dataMap['data'] && typeof dataMap['data'] === 'object' && !Array.isArray(dataMap['data'])) {
          console.log('parseSubmitDocumentResponse - Found nested data key, using nested data');
          const nestedData = dataMap['data'];
          if (nestedData.constructor === Object) {
            dataMap = nestedData;
          } else {
            dataMap = Object.assign({}, nestedData);
          }
          console.log('parseSubmitDocumentResponse - Updated dataMap keys:', Object.keys(dataMap));
        }
        
        // Extract submissionUid
        if (dataMap.hasOwnProperty('submissionUid') && dataMap['submissionUid'] != null) {
          result['submissionUid'] = String(dataMap['submissionUid'] || '');
          console.log('parseSubmitDocumentResponse - submissionUid:', result['submissionUid']);
        }
        
        // Extract UUID and invoiceCodeNumber from acceptedDocuments
        if (dataMap.hasOwnProperty('acceptedDocuments') && dataMap['acceptedDocuments'] != null) {
          const acceptedDocs = dataMap['acceptedDocuments'];
          console.log('parseSubmitDocumentResponse - acceptedDocs type:', Array.isArray(acceptedDocs) ? 'Array' : typeof acceptedDocs);
          console.log('parseSubmitDocumentResponse - acceptedDocs:', JSON.stringify(acceptedDocs, null, 2));
          
          if (Array.isArray(acceptedDocs) && acceptedDocs.length > 0) {
            const firstDoc = acceptedDocs[0];
            console.log('parseSubmitDocumentResponse - firstDoc type:', typeof firstDoc);
            console.log('parseSubmitDocumentResponse - firstDoc:', JSON.stringify(firstDoc, null, 2));
            
            if (firstDoc && typeof firstDoc === 'object' && !Array.isArray(firstDoc)) {
              // Convert to plain object if needed
              let docMap = firstDoc;
              if (firstDoc.constructor !== Object) {
                docMap = Object.assign({}, firstDoc);
              }
              
              console.log('parseSubmitDocumentResponse - docMap keys:', Object.keys(docMap));
              
              // Extract UUID
              if (docMap.hasOwnProperty('uuid') && docMap['uuid'] != null) {
                result['uuid'] = String(docMap['uuid'] || '');
                console.log('parseSubmitDocumentResponse - uuid:', result['uuid']);
              }
              
              // Extract invoiceCodeNumber
              if (docMap.hasOwnProperty('invoiceCodeNumber') && docMap['invoiceCodeNumber'] != null) {
                result['invoiceCodeNumber'] = String(docMap['invoiceCodeNumber'] || '');
                console.log('parseSubmitDocumentResponse - invoiceCodeNumber:', result['invoiceCodeNumber']);
              }
            } else {
              console.log('parseSubmitDocumentResponse - firstDoc is not an object');
            }
          } else {
            console.log('parseSubmitDocumentResponse - acceptedDocs is empty or not an Array. Length:', Array.isArray(acceptedDocs) ? acceptedDocs.length : 'N/A');
          }
        } else {
          console.log('parseSubmitDocumentResponse - No acceptedDocuments key found in dataMap');
        }
      } else {
        console.log('parseSubmitDocumentResponse - data is not an object, type:', typeof data);
      }
    } else {
      // Handle error response
      let errorMessage = '';
      
      console.log('parseSubmitDocumentResponse - Handling error response');
      
      // First, check if error is already parsed (from submitDocument)
      let errorResponse = null;
      if (response.hasOwnProperty('error') && response['error'] != null) {
        const errorData = response['error'];
        if (errorData && typeof errorData === 'object' && !Array.isArray(errorData)) {
          if (errorData.constructor === Object) {
            errorResponse = errorData;
          } else {
            errorResponse = Object.assign({}, errorData);
          }
          console.log('parseSubmitDocumentResponse - Found parsed error in response.error:', JSON.stringify(errorResponse, null, 2));
        }
      }
      
      // If not found, try to parse the response body if it's a string
      if (!errorResponse && response.hasOwnProperty('response') && response['response'] != null) {
        try {
          const responseStr = String(response['response']);
          if (responseStr.length > 0) {
            errorResponse = JSON.parse(responseStr);
            console.log('parseSubmitDocumentResponse - Parsed error response from string:', JSON.stringify(errorResponse, null, 2));
          }
        } catch (e) {
          console.log('parseSubmitDocumentResponse - Error parsing response string:', e);
        }
      }
      
      // Use errorResponse if available, otherwise use response directly
      const sourceMap = errorResponse || response;
      
      // Priority 1: Get error from details.error (most specific)
      if (sourceMap.hasOwnProperty('details') && sourceMap['details'] != null) {
        const details = sourceMap['details'];
        if (details && typeof details === 'object' && !Array.isArray(details)) {
          let detailsMap = details;
          if (details.constructor !== Object) {
            detailsMap = Object.assign({}, details);
          }
          
          if (detailsMap.hasOwnProperty('error') && detailsMap['error'] != null) {
            errorMessage = String(detailsMap['error']);
            console.log('parseSubmitDocumentResponse - Found error in details.error:', errorMessage);
          }
        }
      }
      
      // Priority 2: If no details.error, use error field
      if (!errorMessage && sourceMap.hasOwnProperty('error') && sourceMap['error'] != null) {
        errorMessage = String(sourceMap['error']);
        console.log('parseSubmitDocumentResponse - Found error in error field:', errorMessage);
      }
      
      // Priority 3: Use message field
      if (!errorMessage && sourceMap.hasOwnProperty('message') && sourceMap['message'] != null) {
        errorMessage = String(sourceMap['message']);
        console.log('parseSubmitDocumentResponse - Found error in message field:', errorMessage);
      }
      
      // Priority 4: Fallback to response message if available
      if (!errorMessage && response.hasOwnProperty('message') && response['message'] != null) {
        errorMessage = String(response['message']);
        console.log('parseSubmitDocumentResponse - Found error in response.message:', errorMessage);
      }
      
      result['error'] = errorMessage || 'Unknown error occurred';
      console.log('parseSubmitDocumentResponse - Final error message:', result['error']);
    }
  } catch (e) {
    result['error'] = 'Error parsing response: ' + e.toString();
    console.error('parseSubmitDocumentResponse - Exception:', e);
  }

  return result;
}

/**
 * Parse the response from validateDocument/getDocumentDetails API call
 * @param {Object} response - The response object from validateDocument
 * @returns {Object} Parsed result with all document validation fields
 */
function parseValidateDocumentResponse(response) {
  const result = {
    success: false,
    uuid: '',
    submissionUid: '',
    longId: '',
    typeName: '',
    typeVersionName: '',
    issuerTin: '',
    issuerName: '',
    receiverId: '',
    receiverName: '',
    dateTimeReceived: '',
    dateTimeValidated: '',
    totalExcludingTax: 0.0,
    totalDiscount: 0.0,
    totalNetAmount: 0.0,
    totalPayableAmount: 0.0,
    status: '',
    createdByUserId: '',
    documentStatusReason: null,
    cancelDateTime: null,
    rejectRequestDateTime: null,
    internalId: '',
    dateTimeIssued: '',
    validationSteps: [],
    error: ''
  };

  try {
    console.log('parseValidateDocumentResponse - Input response:', JSON.stringify(response, null, 2));
    console.log('parseValidateDocumentResponse - Response keys:', Object.keys(response));
    
    // Check if response indicates success
    const isSuccess = response['success'] === true;
    result['success'] = isSuccess;
    
    console.log('parseValidateDocumentResponse - isSuccess:', isSuccess);
    
    if (isSuccess) {
      // Handle successful response
      let data = response['data'];
      console.log('parseValidateDocumentResponse - data type:', typeof data);
      console.log('parseValidateDocumentResponse - data:', JSON.stringify(data, null, 2));
      
      // If data is a string, try to parse it as JSON
      if (typeof data === 'string' && data.length > 0) {
        try {
          data = JSON.parse(data);
          console.log('parseValidateDocumentResponse - Parsed data from string:', JSON.stringify(data, null, 2));
        } catch (e) {
          console.log('parseValidateDocumentResponse - Error parsing data string:', e);
        }
      }
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Convert to plain object if needed
        let dataMap = data;
        if (data.constructor !== Object) {
          dataMap = Object.assign({}, data);
        }
        
        console.log('parseValidateDocumentResponse - dataMap keys:', Object.keys(dataMap));
        
        // Extract all fields from data
        result['uuid'] = dataMap['uuid'] ? String(dataMap['uuid']) : '';
        result['submissionUid'] = dataMap['submissionUid'] ? String(dataMap['submissionUid']) : '';
        result['longId'] = dataMap['longId'] ? String(dataMap['longId']) : '';
        result['typeName'] = dataMap['typeName'] ? String(dataMap['typeName']) : '';
        result['typeVersionName'] = dataMap['typeVersionName'] ? String(dataMap['typeVersionName']) : '';
        result['issuerTin'] = dataMap['issuerTin'] ? String(dataMap['issuerTin']) : '';
        result['issuerName'] = dataMap['issuerName'] ? String(dataMap['issuerName']) : '';
        result['receiverId'] = dataMap['receiverId'] ? String(dataMap['receiverId']) : '';
        result['receiverName'] = dataMap['receiverName'] ? String(dataMap['receiverName']) : '';
        result['dateTimeReceived'] = dataMap['dateTimeReceived'] ? String(dataMap['dateTimeReceived']) : '';
        result['dateTimeValidated'] = dataMap['dateTimeValidated'] ? String(dataMap['dateTimeValidated']) : '';
        
        // Parse numeric fields
        if (typeof dataMap['totalExcludingTax'] === 'number') {
          result['totalExcludingTax'] = dataMap['totalExcludingTax'];
        } else {
          result['totalExcludingTax'] = parseFloat(dataMap['totalExcludingTax']?.toString() || '0') || 0.0;
        }
        
        if (typeof dataMap['totalDiscount'] === 'number') {
          result['totalDiscount'] = dataMap['totalDiscount'];
        } else {
          result['totalDiscount'] = parseFloat(dataMap['totalDiscount']?.toString() || '0') || 0.0;
        }
        
        if (typeof dataMap['totalNetAmount'] === 'number') {
          result['totalNetAmount'] = dataMap['totalNetAmount'];
        } else {
          result['totalNetAmount'] = parseFloat(dataMap['totalNetAmount']?.toString() || '0') || 0.0;
        }
        
        if (typeof dataMap['totalPayableAmount'] === 'number') {
          result['totalPayableAmount'] = dataMap['totalPayableAmount'];
        } else {
          result['totalPayableAmount'] = parseFloat(dataMap['totalPayableAmount']?.toString() || '0') || 0.0;
        }
        
        result['status'] = dataMap['status'] ? String(dataMap['status']) : '';
        result['createdByUserId'] = dataMap['createdByUserId'] ? String(dataMap['createdByUserId']) : '';
        result['documentStatusReason'] = dataMap['documentStatusReason'] !== undefined ? dataMap['documentStatusReason'] : null;
        result['cancelDateTime'] = dataMap['cancelDateTime'] !== undefined ? dataMap['cancelDateTime'] : null;
        result['rejectRequestDateTime'] = dataMap['rejectRequestDateTime'] !== undefined ? dataMap['rejectRequestDateTime'] : null;
        result['internalId'] = dataMap['internalId'] ? String(dataMap['internalId']) : '';
        result['dateTimeIssued'] = dataMap['dateTimeIssued'] ? String(dataMap['dateTimeIssued']) : '';
        
        // Extract validation steps
        if (dataMap.hasOwnProperty('validationResults') && dataMap['validationResults'] != null) {
          const validationResults = dataMap['validationResults'];
          if (validationResults && typeof validationResults === 'object' && !Array.isArray(validationResults)) {
            let validationMap = validationResults;
            if (validationResults.constructor !== Object) {
              validationMap = Object.assign({}, validationResults);
            }
            
            if (validationMap.hasOwnProperty('validationSteps') && validationMap['validationSteps'] != null) {
              const validationSteps = validationMap['validationSteps'];
              if (Array.isArray(validationSteps)) {
                result['validationSteps'] = validationSteps;
                console.log('parseValidateDocumentResponse - Found', validationSteps.length, 'validation steps');
              }
            }
          }
        }
      } else {
        console.log('parseValidateDocumentResponse - data is not an object, type:', typeof data);
      }
    } else {
      // Handle error response
      let errorMessage = '';
      
      console.log('parseValidateDocumentResponse - Handling error response');
      
      // First, check if error is already parsed (from getDocumentDetails)
      let errorResponse = null;
      if (response.hasOwnProperty('error') && response['error'] != null) {
        const errorData = response['error'];
        if (errorData && typeof errorData === 'object' && !Array.isArray(errorData)) {
          if (errorData.constructor === Object) {
            errorResponse = errorData;
          } else {
            errorResponse = Object.assign({}, errorData);
          }
          console.log('parseValidateDocumentResponse - Found parsed error in response.error:', JSON.stringify(errorResponse, null, 2));
        }
      }
      
      // If not found, try to parse the response body if it's a string
      if (!errorResponse && response.hasOwnProperty('response') && response['response'] != null) {
        try {
          const responseStr = String(response['response']);
          if (responseStr.length > 0) {
            errorResponse = JSON.parse(responseStr);
            console.log('parseValidateDocumentResponse - Parsed error response from string:', JSON.stringify(errorResponse, null, 2));
          }
        } catch (e) {
          console.log('parseValidateDocumentResponse - Error parsing response string:', e);
        }
      }
      
      // Use errorResponse if available, otherwise use response directly
      const sourceMap = errorResponse || response;
      
      // Priority 1: Get error from details.error (most specific)
      if (sourceMap.hasOwnProperty('details') && sourceMap['details'] != null) {
        const details = sourceMap['details'];
        if (details && typeof details === 'object' && !Array.isArray(details)) {
          let detailsMap = details;
          if (details.constructor !== Object) {
            detailsMap = Object.assign({}, details);
          }
          
          if (detailsMap.hasOwnProperty('error') && detailsMap['error'] != null) {
            errorMessage = String(detailsMap['error']);
            console.log('parseValidateDocumentResponse - Found error in details.error:', errorMessage);
          }
        }
      }
      
      // Priority 2: If no details.error, use error field
      if (!errorMessage && sourceMap.hasOwnProperty('error') && sourceMap['error'] != null) {
        errorMessage = String(sourceMap['error']);
        console.log('parseValidateDocumentResponse - Found error in error field:', errorMessage);
      }
      
      // Priority 3: Use message field
      if (!errorMessage && sourceMap.hasOwnProperty('message') && sourceMap['message'] != null) {
        errorMessage = String(sourceMap['message']);
        console.log('parseValidateDocumentResponse - Found error in message field:', errorMessage);
      }
      
      // Priority 4: Fallback to response message if available
      if (!errorMessage && response.hasOwnProperty('message') && response['message'] != null) {
        errorMessage = String(response['message']);
        console.log('parseValidateDocumentResponse - Found error in response.message:', errorMessage);
      }
      
      result['error'] = errorMessage || 'Unknown error occurred';
      console.log('parseValidateDocumentResponse - Final error message:', result['error']);
    }
  } catch (e) {
    result['error'] = 'Error parsing response: ' + e.toString();
    console.error('parseValidateDocumentResponse - Exception:', e);
  }

  return result;
}

/**
 * Create update data structure for saving submission result to order document
 * @param {Object} submissionResult - The parsed submission result from parseSubmitDocumentResponse
 * @returns {Object} Update data object for Firestore
 */
function saveSubmissionResult(submissionResult) {
  const updateData = {
    'submissionResult': submissionResult,
    // Also save individual fields for easy access
    'documentUuid': submissionResult['uuid']?.toString() || '',
    'invoiceCodeNumber': submissionResult['invoiceCodeNumber']?.toString() || '',
    'submissionUid': submissionResult['submissionUid']?.toString() || ''
  };
  
  // Update submittedAt timestamp if submission was successful (using current local time)
  if (submissionResult['success'] === true) {
    updateData['submittedAt'] = new Date();
  }
  
  return updateData;
}

/**
 * Create update data structure for saving validation result to order document
 * @param {Object} validationResult - The parsed validation result from parseValidateDocumentResponse
 * @returns {Object} Update data object for Firestore
 */
function saveValidationResult(validationResult) {
  const updateData = {
    'validationResult': validationResult,
    // Update lastCheckedAt timestamp (using current local time)
    'lastCheckedAt': new Date()
  };
  
  // Update completedAt if validation was successful and status is valid
  if (validationResult['success'] === true && 
      validationResult['status']?.toString().toLowerCase() === 'valid') {
    updateData['completedAt'] = new Date();
  }
  
  return updateData;
}

module.exports = {
  parseSubmitDocumentResponse,
  parseValidateDocumentResponse,
  saveSubmissionResult,
  saveValidationResult
};

