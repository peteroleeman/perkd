/**
 * Class representing an Invoice Document model
 */
class InvoiceDocumentModel {
  /**
   * Create an invoice document model
   * @param {Object} options - The invoice document properties
   */
  constructor({
    codeNumber,
    documentHash,
    document,
    format = 'XML',
    xml,
    createdAt = new Date(),
    status = 'pending',
    submittedAt = null,
    validatedAt = null,
    completedAt = null,
    documentUuid = null,
    submissionData = null,
    validationData = null
  }) {
    this.codeNumber = codeNumber;
    this.documentHash = documentHash;
    this.document = document;
    this.format = format;
    this.xml = xml;
    this.createdAt = createdAt;
    this.status = status;
    this.submittedAt = submittedAt;
    this.validatedAt = validatedAt;
    this.completedAt = completedAt;
    this.documentUuid = documentUuid;
    this.submissionData = submissionData;
    this.validationData = validationData;
  }

  /**
   * Create a model from Firestore document snapshot
   * @param {Object} doc - Firestore document snapshot
   * @returns {InvoiceDocumentModel} New instance based on Firestore data
   */
  static fromDocument(doc) {
    const data = doc.data();
    
    return new InvoiceDocumentModel({
      codeNumber: data.codeNumber || '',
      documentHash: data.documentHash || '',
      document: data.document || '',
      format: data.format || 'XML',
      xml: data.xml || '',
      createdAt: data.createdAt || new Date(),
      status: data.status || 'pending',
      submittedAt: data.submittedAt || null,
      validatedAt: data.validatedAt || null,
      completedAt: data.completedAt || null,
      documentUuid: data.documentUuid || null,
      submissionData: data.submissionData || null,
      validationData: data.validationData || null
    });
  }

  /**
   * Create a model from a plain JavaScript object
   * @param {Object} data - Plain JS object with model data
   * @returns {InvoiceDocumentModel} New instance based on data object
   */
  static fromMap(data) {
    return new InvoiceDocumentModel({
      codeNumber: data.codeNumber || '',
      documentHash: data.documentHash || '',
      document: data.document || '',
      format: data.format || 'XML',
      xml: data.xml || '',
      createdAt: data.createdAt || new Date(),
      status: data.status || 'pending',
      submittedAt: data.submittedAt || null,
      validatedAt: data.validatedAt || null,
      completedAt: data.completedAt || null,
      documentUuid: data.documentUuid || null,
      submissionData: data.submissionData || null,
      validationData: data.validationData || null
    });
  }

  /**
   * Convert model to plain object for Firestore
   * @returns {Object} Plain JS object for Firestore
   */
  toMap() {
    return {
      codeNumber: this.codeNumber,
      documentHash: this.documentHash,
      document: this.document,
      format: this.format,
      xml: this.xml,
      createdAt: this.createdAt,
      status: this.status,
      submittedAt: this.submittedAt,
      validatedAt: this.validatedAt,
      completedAt: this.completedAt,
      documentUuid: this.documentUuid,
      submissionData: this.submissionData,
      validationData: this.validationData
    };
  }

  /**
   * Create a copy of the model with updated values
   * @param {Object} updates - Values to update in the new copy
   * @returns {InvoiceDocumentModel} New instance with updated values
   */
  copyWith({
    codeNumber,
    documentHash,
    document,
    format,
    xml,
    createdAt,
    status,
    submittedAt,
    validatedAt,
    completedAt,
    documentUuid,
    submissionData,
    validationData
  } = {}) {
    return new InvoiceDocumentModel({
      codeNumber: codeNumber !== undefined ? codeNumber : this.codeNumber,
      documentHash: documentHash !== undefined ? documentHash : this.documentHash,
      document: document !== undefined ? document : this.document,
      format: format !== undefined ? format : this.format,
      xml: xml !== undefined ? xml : this.xml,
      createdAt: createdAt !== undefined ? createdAt : this.createdAt,
      status: status !== undefined ? status : this.status,
      submittedAt: submittedAt !== undefined ? submittedAt : this.submittedAt,
      validatedAt: validatedAt !== undefined ? validatedAt : this.validatedAt,
      completedAt: completedAt !== undefined ? completedAt : this.completedAt,
      documentUuid: documentUuid !== undefined ? documentUuid : this.documentUuid,
      submissionData: submissionData !== undefined ? submissionData : this.submissionData,
      validationData: validationData !== undefined ? validationData : this.validationData
    });
  }

  /**
   * Create a model with submission results
   * @param {Object} submissionResult - Results from document submission
   * @returns {InvoiceDocumentModel} New instance with submission results
   */
  withSubmissionResults(submissionResult) {
    return this.copyWith({
      status: submissionResult.success ? 'submitted' : 'submission_failed',
      submittedAt: new Date(),
      documentUuid: submissionResult.documentUuid || null,
      submissionData: {
        success: submissionResult.success || false,
        step: submissionResult.step || '-',
        response: submissionResult.response || null,
        error: submissionResult.error || null
      }
    });
  }

  /**
   * Create a model with validation results
   * @param {Object} validationResult - Results from document validation
   * @returns {InvoiceDocumentModel} New instance with validation results
   */
  withValidationResults(validationResult) {
    let newStatus = 'validation_failed';
    if (validationResult.success) {
      newStatus = validationResult.isValid ? 'valid' : 'invalid';
    }
    
    return this.copyWith({
      status: newStatus,
      validatedAt: new Date(),
      validationData: {
        success: validationResult.success || false,
        isValid: validationResult.isValid || false,
        documentDetails: validationResult.documentDetails || null,
        error: validationResult.error || null
      }
    });
  }

  /**
   * Create a model marked as completed
   * @returns {InvoiceDocumentModel} New instance marked as completed
   */
  asCompleted() {
    return this.copyWith({
      status: 'completed',
      completedAt: new Date()
    });
  }
}

module.exports = InvoiceDocumentModel; 