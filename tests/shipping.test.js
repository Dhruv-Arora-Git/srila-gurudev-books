/**
 * Test Suite: India Post Shipping, Weight Calculation & Courier Tariff Engine
 */
(() => {
const { describe, test, expect } = (typeof module !== 'undefined' && module.exports) 
  ? require('./test-utils') 
  : window.TestFramework;

const CONFIG = (typeof module !== 'undefined' && module.exports)
  ? require('../js/config')
  : window.CONFIG;

const { getShippingCharge, evaluateDestinationZone } = (typeof module !== 'undefined' && module.exports)
  ? require('../js/checkout')
  : window;

describe('Shipping & Courier Tariff Engine', () => {

  test('Adds fixed 20g packaging weight to total book weight', () => {
    // 400g book + 20g packaging = 420g (Falls in <=500g slab)
    const resMH = getShippingCharge(400, 'Maharashtra', '411048');
    expect(resMH.chargeableWeight).toBe(420);
    expect(resMH.rate).toBe(70);
  });

  test('Accurately calculates Maharashtra courier slabs (Dispatched from Pune)', () => {
    // Slabs: 500g: 70, 1000g: 106, 1500g: 142, 2000g: 198, 3000g: 277, 4000g: 344, 5000g: 420
    // Test 100g book + 20g packing = 120g (<= 500g)
    expect(getShippingCharge(100, 'Maharashtra', '411001').rate).toBe(70);

    // Test 800g book + 20g packing = 820g (501 - 1000g)
    expect(getShippingCharge(800, 'Maharashtra', '411001').rate).toBe(106);

    // Test 1300g book + 20g packing = 1320g (1001 - 1500g)
    expect(getShippingCharge(1300, 'Maharashtra', '411001').rate).toBe(142);

    // Test 1800g book + 20g packing = 1820g (1501 - 2000g)
    expect(getShippingCharge(1800, 'Maharashtra', '411001').rate).toBe(198);

    // Test 2500g book + 20g packing = 2520g (2001 - 3000g)
    expect(getShippingCharge(2500, 'Maharashtra', '411001').rate).toBe(277);

    // Test 3500g book + 20g packing = 3520g (3001 - 4000g)
    expect(getShippingCharge(3500, 'Maharashtra', '411001').rate).toBe(344);

    // Test 4500g book + 20g packing = 4520g (4001 - 5000g)
    expect(getShippingCharge(4500, 'Maharashtra', '411001').rate).toBe(420);
  });

  test('Accurately calculates Other States courier slabs', () => {
    // Other States Slabs: 500g: 72, 1000g: 114, 1500g: 171, 2000g: 239, 3000g: 337, 4000g: 420, 5000g: 515
    // Test 300g book + 20g = 320g to Delhi
    expect(getShippingCharge(300, 'Delhi', '110001').rate).toBe(72);

    // Test 900g book + 20g = 920g to West Bengal
    expect(getShippingCharge(900, 'West Bengal', '700001').rate).toBe(114);

    // Test 1400g book + 20g = 1420g to Karnataka
    expect(getShippingCharge(1400, 'Karnataka', '560001').rate).toBe(171);

    // Test 1900g book + 20g = 1920g to Uttar Pradesh
    expect(getShippingCharge(1900, 'Uttar Pradesh', '281121').rate).toBe(239);

    // Test 2800g book + 20g = 2820g to Gujarat
    expect(getShippingCharge(2800, 'Gujarat', '380001').rate).toBe(337);

    // Test 4800g book + 20g = 4820g to Tamil Nadu
    expect(getShippingCharge(4800, 'Tamil Nadu', '600001').rate).toBe(515);
  });

  test('Calculates parcel weights above 5kg (>5000g) accurately', () => {
    // Over 5000g in MH: Base 420 + Math.ceil((wt - 5000)/1000) * 70
    // 5980g book + 20g = 6000g (1 extra kg) -> 420 + 70 = 490
    expect(getShippingCharge(5980, 'Maharashtra', '411001').rate).toBe(490);

    // 6980g book + 20g = 7000g (2 extra kg) -> 420 + 140 = 560
    expect(getShippingCharge(6980, 'Maharashtra', '411001').rate).toBe(560);

    // Over 5000g in Other States: Base 515 + Math.ceil((wt - 5000)/1000) * 90
    // 5980g book + 20g = 6000g to UP -> 515 + 90 = 605
    expect(getShippingCharge(5980, 'Uttar Pradesh', '281121').rate).toBe(605);
  });

  test('Correctly routes Goa (pincode prefix 403xxx) as Other States', () => {
    // Goa postal codes start with 403. Even though in MH postal circle, destination is interstate
    const zoneByPin = evaluateDestinationZone('', '403001');
    expect(zoneByPin.isMaharashtra).toBe(false);

    const zoneByName = evaluateDestinationZone('Goa', '403101');
    expect(zoneByName.isMaharashtra).toBe(false);

    // Courier charge should use Other States rate (72 Rs for <=500g, not 70)
    const charge = getShippingCharge(200, 'Goa', '403001');
    expect(charge.isMaharashtra).toBe(false);
    expect(charge.rate).toBe(72);
  });

  test('Correctly resolves Maharashtra pincodes when state input is blank', () => {
    // Pune 411048
    const zonePune = evaluateDestinationZone('', '411048');
    expect(zonePune.isMaharashtra).toBe(true);

    // Mumbai 400001
    const zoneMumbai = evaluateDestinationZone('', '400001');
    expect(zoneMumbai.isMaharashtra).toBe(true);

    // Nagpur 440001
    const zoneNagpur = evaluateDestinationZone('', '440001');
    expect(zoneNagpur.isMaharashtra).toBe(true);
  });
});
})();
