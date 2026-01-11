/**
 * InvoiceHeader class for generating invoice header XML
 */
const InvoiceLine = require('./InvoiceLine');

class InvoiceHeader {
  /**
   * Create a new invoice header
   * @param {Object} options - Invoice header options
   */
  constructor({
    id,
    dateTime = new Date(Date.now() - 86400000), // Yesterday
    // Supplier defaults
    supplierCertEX = "CPT-CCN-W-211111-KL-000002",
    supplierIndustryCode = "01111",
    supplierIndustryName = "Growing of maize",
    supplierTIN = "IG10676287070",
    supplierNRIC = "770514075343",
    supplierCity = "Kuala Lumpur",
    supplierPostalZone = "50480",
    supplierCountrySubentityCode = "14",
    supplierAddressLine1 = "Lot 66",
    supplierAddressLine2 = "Bangunan Merdeka",
    supplierAddressLine3 = "Persiaran Jaya",
    supplierCountryCode = "MYS",
    supplierRegistrationName = "AMS Setia Jaya Sdn. Bhd.",
    supplierTelephone = "+60124508261",
    supplierEmail = "general.ams@supplier.com",
    supplierCompanyID = "",
    supplierSSTRegistrationNo = "NA",
    supplierTourismTaxNo = "NA",
    // Customer defaults
    customerTIN = "C2584563200",
    customerBRN = "201901234567",
    customerNRIC = "880101-01-1234",
    customerCity = "Kuala Lumpur",
    customerPostalZone = "50480",
    customerCountrySubentityCode = "14",
    customerAddressLine1 = "NA",
    customerAddressLine2 = "NA",
    customerAddressLine3 = "NA",
    customerCountryCode = "MYS",
    customerRegistrationName = "Hebat Group",
    customerTelephone = "+60124508261",
    customerEmail = "name@buyer.com",
    customerPartyName = "",
    customerPhone = "",
    // Payment information
    paymentMeansCode = "",
    // Tax and monetary amounts
    taxAmount = "87.63",
    lineExtensionAmount = "1436.50",
    taxExclusiveAmount = "1436.50",
    taxInclusiveAmount = "1436.50",
    chargeTotalAmount = "1436.50",
    payableRoundingAmount = "0.30",
    payableAmount = "1436.50",
    currencyID = "MYR",
    allowanceTotalAmount = "0.00",
    // Invoice lines - default to a single line if not specified
    invoiceLines = [new InvoiceLine({ id: "1234" })]
  }) {
    this.id = id;
    this.dateTime = dateTime;
    
    // Supplier info
    this.supplierCertEX = supplierCertEX;
    this.supplierIndustryCode = supplierIndustryCode;
    this.supplierIndustryName = supplierIndustryName;
    this.supplierTIN = supplierTIN;
    this.supplierNRIC = supplierNRIC;
    this.supplierCity = supplierCity;
    this.supplierPostalZone = supplierPostalZone;
    this.supplierCountrySubentityCode = supplierCountrySubentityCode;
    this.supplierAddressLine1 = supplierAddressLine1;
    this.supplierAddressLine2 = supplierAddressLine2;
    this.supplierAddressLine3 = supplierAddressLine3;
    this.supplierCountryCode = supplierCountryCode;
    this.supplierRegistrationName = supplierRegistrationName;
    this.supplierTelephone = supplierTelephone;
    this.supplierEmail = supplierEmail;
    this.supplierCompanyID = supplierCompanyID;
    this.supplierSSTRegistrationNo = supplierSSTRegistrationNo;
    this.supplierTourismTaxNo = supplierTourismTaxNo;
    
    // Customer info
    this.customerTIN = customerTIN;
    this.customerBRN = customerBRN;
    this.customerNRIC = customerNRIC;
    this.customerCity = customerCity;
    this.customerPostalZone = customerPostalZone;
    this.customerCountrySubentityCode = customerCountrySubentityCode;
    this.customerAddressLine1 = customerAddressLine1;
    this.customerAddressLine2 = customerAddressLine2;
    this.customerAddressLine3 = customerAddressLine3;
    this.customerCountryCode = customerCountryCode;
    this.customerRegistrationName = customerRegistrationName;
    this.customerTelephone = customerTelephone;
    this.customerEmail = customerEmail;
    this.customerPartyName = customerPartyName;
    this.customerPhone = customerPhone;
    
    // Payment info
    this.paymentMeansCode = paymentMeansCode;
    
    // Tax and monetary amounts
    this.taxAmount = taxAmount;
    this.lineExtensionAmount = lineExtensionAmount;
    this.taxExclusiveAmount = taxExclusiveAmount;
    this.taxInclusiveAmount = taxInclusiveAmount;
    this.chargeTotalAmount = chargeTotalAmount;
    this.payableRoundingAmount = payableRoundingAmount;
    this.payableAmount = payableAmount;
    this.currencyID = currencyID;
    this.allowanceTotalAmount = allowanceTotalAmount;
    
    // Invoice lines
    this.invoiceLines = invoiceLines;
  }

  /**
   * Returns the issue date in format YYYY-MM-DD
   * @returns {string} Formatted date
   */
  get issueDate() {
    return this.dateTime.toISOString().split('T')[0];
  }

  /**
   * Returns the issue time in format HH:MM:SSZ
   * @returns {string} Formatted time
   */
  get issueTime() {
    // Format time as HH:MM:SSZ
    const isoTime = this.dateTime.toISOString();
    const timePart = isoTime.split('T')[1].split('.')[0]; // Get HH:MM:SS from ISO format
    return timePart + 'Z';
  }

  /**
   * Creates XML for all invoice lines
   * @returns {string} XML for all invoice lines
   */
  getInvoiceLinesXml() {
    return this.invoiceLines.map(line => line.toXml()).join('\n');
  }

  /**
   * Creates a map representation of the invoice header
   * @returns {Object} Map of key invoice fields
   */
  toMap() {
    return {
      'ID': this.id,
      'IssueDate': this.issueDate,
      'IssueTime': this.issueTime,
    };
  }

  /**
   * Creates XML for the supplier party section
   * @returns {string} XML for supplier party
   */
  getSupplierPartyXml() {
    return `
<cac:AccountingSupplierParty>
  <cbc:AdditionalAccountID schemeAgencyName="CertEX">${this.supplierCertEX}</cbc:AdditionalAccountID>
  <cac:Party>
    <cbc:IndustryClassificationCode name="${this.supplierIndustryName}">${this.supplierIndustryCode}</cbc:IndustryClassificationCode>
    <cac:PartyIdentification>
      <cbc:ID schemeID="TIN">${this.supplierTIN}</cbc:ID>
    </cac:PartyIdentification>
     
       ${this.supplierNRIC && this.supplierNRIC.trim() !== '' ? `<cac:PartyIdentification><cbc:ID schemeID="NRIC">${this.supplierNRIC}</cbc:ID></cac:PartyIdentification>` : ''}
      ${this.supplierCompanyID && this.supplierCompanyID.trim() !== '' ? `<cac:PartyIdentification><cbc:ID schemeID="BRN">${this.supplierCompanyID}</cbc:ID></cac:PartyIdentification>` : ''}
      ${this.supplierSSTRegistrationNo && this.supplierSSTRegistrationNo !== 'NA' ? `<cac:PartyIdentification><cbc:ID schemeID="SST">${this.supplierSSTRegistrationNo}</cbc:ID></cac:PartyIdentification>` : ''}
      ${this.supplierTourismTaxNo && this.supplierTourismTaxNo !== 'NA' ? `<cac:PartyIdentification><cbc:ID schemeID="TTX">${this.supplierTourismTaxNo}</cbc:ID></cac:PartyIdentification>` : ''}
    <cac:PostalAddress>
      <cbc:CityName>${this.supplierCity}</cbc:CityName>
      <cbc:PostalZone>${this.supplierPostalZone}</cbc:PostalZone>
      <cbc:CountrySubentityCode>${this.supplierCountrySubentityCode}</cbc:CountrySubentityCode>
      <cac:AddressLine>
        <cbc:Line>${this.supplierAddressLine1}</cbc:Line>
      </cac:AddressLine>
      <cac:AddressLine>
        <cbc:Line>${this.supplierAddressLine2}</cbc:Line>
      </cac:AddressLine>
      <cac:AddressLine>
        <cbc:Line>${this.supplierAddressLine3}</cbc:Line>
      </cac:AddressLine>
      <cac:Country>
        <cbc:IdentificationCode listID="ISO3166-1" listAgencyID="6">${this.supplierCountryCode}</cbc:IdentificationCode>
      </cac:Country>
    </cac:PostalAddress>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${this.supplierRegistrationName}</cbc:RegistrationName>
    </cac:PartyLegalEntity>
    <cac:Contact>
      <cbc:Telephone>${this.supplierTelephone}</cbc:Telephone>
      <cbc:ElectronicMail>${this.supplierEmail}</cbc:ElectronicMail>
    </cac:Contact>
  </cac:Party>
</cac:AccountingSupplierParty>`;
  }

  /**
   * Creates XML for the customer party section
   * @returns {string} XML for customer party
   */
  getCustomerPartyXml() {
    let identificationXml = `
    <cac:PartyIdentification>
      <cbc:ID schemeID="TIN">${this.customerTIN}</cbc:ID>
    </cac:PartyIdentification>`;
    
    if (this.customerBRN) {
      identificationXml += `
    <cac:PartyIdentification>
      <cbc:ID schemeID="BRN">${this.customerBRN}</cbc:ID>
    </cac:PartyIdentification>`;
    } else if (this.customerNRIC) {
      identificationXml += `
    <cac:PartyIdentification>
      <cbc:ID schemeID="NRIC">${this.customerNRIC}</cbc:ID>
    </cac:PartyIdentification>`;
    }
  
    return `
<cac:AccountingCustomerParty>
  <cac:Party>${identificationXml}
    <cac:PostalAddress>
      <cbc:CityName>${this.customerCity}</cbc:CityName>
      <cbc:PostalZone>${this.customerPostalZone}</cbc:PostalZone>
      <cbc:CountrySubentityCode>${this.customerCountrySubentityCode}</cbc:CountrySubentityCode>
      <cac:AddressLine>
        <cbc:Line>${this.customerAddressLine1}</cbc:Line>
      </cac:AddressLine>
      <cac:AddressLine>
        <cbc:Line>${this.customerAddressLine2}</cbc:Line>
      </cac:AddressLine>
      <cac:AddressLine>
        <cbc:Line>${this.customerAddressLine3}</cbc:Line>
      </cac:AddressLine>
      <cac:Country>
        <cbc:IdentificationCode listID="ISO3166-1" listAgencyID="6">${this.customerCountryCode}</cbc:IdentificationCode>
      </cac:Country>
    </cac:PostalAddress>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${this.customerPartyName || this.customerRegistrationName}</cbc:RegistrationName>
    </cac:PartyLegalEntity>
    <cac:Contact>
      <cbc:Telephone>${this.customerPhone || this.customerTelephone}</cbc:Telephone>
      <cbc:ElectronicMail>${this.customerEmail}</cbc:ElectronicMail>
    </cac:Contact>
  </cac:Party>
</cac:AccountingCustomerParty>`;
  }

  /**
   * Creates XML for tax and monetary totals
   * @returns {string} XML for tax and monetary information
   */
  getTaxAndMonetaryXml() {
    let paymentMeansXml = '';
    if (this.paymentMeansCode) {
      paymentMeansXml = `
<cac:PaymentMeans>
  <cbc:PaymentMeansCode>${this.paymentMeansCode}</cbc:PaymentMeansCode>
</cac:PaymentMeans>`;
    }
    
    return `
<cac:TaxTotal>
  <cbc:TaxAmount currencyID="${this.currencyID}">${this.taxAmount}</cbc:TaxAmount>
  <cac:TaxSubtotal>
    <cbc:TaxableAmount currencyID="${this.currencyID}">${this.lineExtensionAmount}</cbc:TaxableAmount>
    <cbc:TaxAmount currencyID="${this.currencyID}">${this.taxAmount}</cbc:TaxAmount>
    <cac:TaxCategory>
      <cbc:ID>02</cbc:ID>
      <cac:TaxScheme>
        <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6"></cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:TaxSubtotal>
</cac:TaxTotal>${paymentMeansXml}
<cac:LegalMonetaryTotal>
  <cbc:LineExtensionAmount currencyID="${this.currencyID}">${this.lineExtensionAmount}</cbc:LineExtensionAmount>
  <cbc:TaxExclusiveAmount currencyID="${this.currencyID}">${this.taxExclusiveAmount}</cbc:TaxExclusiveAmount>
  <cbc:TaxInclusiveAmount currencyID="${this.currencyID}">${this.taxInclusiveAmount}</cbc:TaxInclusiveAmount>
  <cbc:AllowanceTotalAmount currencyID="${this.currencyID}">${this.allowanceTotalAmount}</cbc:AllowanceTotalAmount>
  <cbc:ChargeTotalAmount currencyID="${this.currencyID}">${this.chargeTotalAmount}</cbc:ChargeTotalAmount>
  <cbc:PayableRoundingAmount currencyID="${this.currencyID}">${this.payableRoundingAmount}</cbc:PayableRoundingAmount>
  <cbc:PayableAmount currencyID="${this.currencyID}">${this.payableAmount}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>`;
  }

  /**
   * Generates a complete XML invoice document
   * @returns {string} Complete XML invoice
   */
  toFullXml() {
    return `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
	xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
	xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
	<cbc:ID>${this.id}</cbc:ID>
	<cbc:IssueDate>${this.issueDate}</cbc:IssueDate>
	<cbc:IssueTime>${this.issueTime}</cbc:IssueTime>
	<cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
	<cbc:DocumentCurrencyCode>${this.currencyID}</cbc:DocumentCurrencyCode>
	<cac:BillingReference>
		<cac:AdditionalDocumentReference>
			<cbc:ID>${this.id}</cbc:ID>
		</cac:AdditionalDocumentReference>
	</cac:BillingReference>
	
${this.getSupplierPartyXml()}
${this.getCustomerPartyXml()}
${this.getTaxAndMonetaryXml()}
${this.getInvoiceLinesXml()}
</Invoice>`;
  }
}

module.exports = InvoiceHeader; 