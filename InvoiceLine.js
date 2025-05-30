/**
 * InvoiceLine class for generating invoice line XML
 */
class InvoiceLine {
  /**
   * Create a new invoice line
   * @param {Object} options - Invoice line options
   */
  constructor({
    id,
    quantity = "1",
    unitCode = "C62",
    lineExtensionAmount = "1436.50",
    itemDescription = "Laptop Peripherals",
    originCountryCode = "MYS",
    ptcClassificationCode = "12344321",
    classClassificationCode = "003",
    priceAmount = "17",
    itemPriceExtensionAmount = "100",
    currencyID = "MYR",
    itemCode = "",
    itemCategory = "",
    taxAmount = "0",
    taxPercentage = 0,
  }) {
    this.id = id;
    this.quantity = quantity;
    this.unitCode = unitCode;
    this.lineExtensionAmount = lineExtensionAmount;
    this.itemDescription = itemDescription;
    this.originCountryCode = originCountryCode;
    this.ptcClassificationCode = ptcClassificationCode;
    this.classClassificationCode = classClassificationCode;
    this.priceAmount = priceAmount;
    this.itemPriceExtensionAmount = itemPriceExtensionAmount;
    this.currencyID = currencyID;
    this.itemCode = itemCode;
    this.itemCategory = itemCategory;
    this.taxAmount = taxAmount;
    this.taxPercentage = taxPercentage;
  }

  /**
   * Converts this invoice line to XML format
   * @returns {string} XML representation of the invoice line
   */
  toXml() {
    return `
<cac:InvoiceLine>
  <cbc:ID>${this.id}</cbc:ID>
  <cbc:InvoicedQuantity unitCode="${this.unitCode}">${this.quantity}</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="${this.currencyID}">${this.lineExtensionAmount}</cbc:LineExtensionAmount>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${this.currencyID}">${this.taxAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${this.currencyID}">${this.lineExtensionAmount}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${this.currencyID}">0</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${this.taxPercentage > 0 ? '02' : '06'}</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6"></cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:Item>
    <cbc:Description>${this.itemDescription}</cbc:Description>
    <cac:CommodityClassification>
      <cbc:ItemClassificationCode listID="CLASS">${this.classClassificationCode}</cbc:ItemClassificationCode>
    </cac:CommodityClassification>
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="${this.currencyID}">${this.priceAmount}</cbc:PriceAmount>
  </cac:Price>
  <cac:ItemPriceExtension>
    <cbc:Amount currencyID="${this.currencyID}">${this.itemPriceExtensionAmount}</cbc:Amount>
  </cac:ItemPriceExtension>
</cac:InvoiceLine>`;
  }
}

module.exports = InvoiceLine; 