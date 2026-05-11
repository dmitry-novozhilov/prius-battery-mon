#include <NimBLEDevice.h>

#define COUNT_OF(x) (sizeof(x) / sizeof(x[0]))
const int MUXES_CHIP_SELECT_PIN[] = {D8, D7};
const int MUX_CHAN_SELECT_PINS[] = {D6, D5, D4, D3};
const int MUX_OUT_PINS_CNT = (1UL << COUNT_OF(MUX_CHAN_SELECT_PINS)) * COUNT_OF(MUXES_CHIP_SELECT_PIN);
#define NTC_PIN A2
#define MEASUREMENTS_CNT 100

// --- BLE UUIDs
#define SERVICE_UUID        "9709c63e-d287-44fa-a0ef-59e3ffd6bc70"
#define CHAR_SNAPSHOT_UUID  "9709c63e-d287-44fa-a0ef-59e3ffd6bc71"  // READ
#define CHAR_NOTIFY_UUID    "9709c63e-d287-44fa-a0ef-59e3ffd6bc72"  // NOTIFY

#define BLE_DEVICE_NAME "PriusBattMon"

uint16_t measurements[MUX_OUT_PINS_CNT];

NimBLECharacteristic* pSnapshotChar = nullptr;
NimBLECharacteristic* pNotifyChar   = nullptr;
NimBLEServer*         pServer       = nullptr;
volatile bool         deviceConnected = false;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    deviceConnected = true;
    Serial.println("BLE: client connected");
    // на C3 поднимем интервал коннекта пониже, чтобы быстрее уходили нотификации
    s->updateConnParams(info.getConnHandle(), 12, 24, 0, 200);
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    deviceConnected = false;
    Serial.printf("BLE: client disconnected, reason=%d\n", reason);
    NimBLEDevice::startAdvertising();
  }
};

void setupBLE() {
  NimBLEDevice::init(BLE_DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEDevice::setMTU(247); // запросим побольше MTU; клиент договорится о реальном

  pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService* pService = pServer->createService(SERVICE_UUID);

  pSnapshotChar = pService->createCharacteristic(CHAR_SNAPSHOT_UUID, NIMBLE_PROPERTY::READ);
  pSnapshotChar->setValue((uint8_t*)measurements, sizeof(measurements));

  pNotifyChar = pService->createCharacteristic(CHAR_NOTIFY_UUID, NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ);
  pNotifyChar->setValue((uint8_t*)measurements, sizeof(measurements));

  NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
  pAdv->addServiceUUID(SERVICE_UUID);
  pAdv->setName(BLE_DEVICE_NAME);
  pAdv->enableScanResponse(true);
  NimBLEDevice::startAdvertising();
  Serial.println("BLE: advertising started");
}

void setup() {
  for (int mux_idx = 0; mux_idx < COUNT_OF(MUXES_CHIP_SELECT_PIN); mux_idx++) {
    pinMode(MUXES_CHIP_SELECT_PIN[mux_idx], OUTPUT);
  }
  for (int pin_idx = 0; pin_idx < COUNT_OF(MUX_CHAN_SELECT_PINS); pin_idx++) {
    pinMode(MUX_CHAN_SELECT_PINS[pin_idx], OUTPUT);
  }
  pinMode(NTC_PIN, ANALOG);
  Serial.begin(115200);
  Serial.printf("Start measurement %d sensors\n", MUX_OUT_PINS_CNT);

  setupBLE();
}

void loop() {
  clear_measurements();
  read_all_mux();
  print_measurements();
  publish_ble();
}

void publish_ble() {
  // обновляем READ-характеристику в любом случае — клиент сможет дёрнуть её ad hoc
  pSnapshotChar->setValue((uint8_t*)measurements, sizeof(measurements));

  if (deviceConnected) {
    pNotifyChar->setValue((uint8_t*)measurements, sizeof(measurements));
    pNotifyChar->notify();
  }
}

void read_all_mux() {
  int sensor_idx = 0;
  for (int mux_idx = 0; mux_idx < COUNT_OF(MUXES_CHIP_SELECT_PIN); mux_idx++) {
    select_mux(mux_idx);
    for (int chan_idx = 0; chan_idx < 1UL << COUNT_OF(MUX_CHAN_SELECT_PINS); chan_idx++) {
      select_chan(chan_idx);
      uint32_t val = 0;
      for (int measurement_num = 0; measurement_num < MEASUREMENTS_CNT; measurement_num++) {
        val += analogRead(NTC_PIN);
      }
      val /= MEASUREMENTS_CNT;
      measurements[sensor_idx] = (uint16_t)val;
      sensor_idx++;
    }
  }
}

void clear_measurements() {
  for (int sensor_idx = 0; sensor_idx < MUX_OUT_PINS_CNT; sensor_idx++) {
    measurements[sensor_idx] = 0;
  }
}

void print_measurements() {
  for (int sensor_idx = 0; sensor_idx < MUX_OUT_PINS_CNT; sensor_idx++) {
    Serial.printf("print_measurements: sensor_idx=%d result=%d\n", sensor_idx, measurements[sensor_idx]);
  }
}

void select_mux(int target_mux_idx) {
  for (int mux_idx = 0; mux_idx < COUNT_OF(MUXES_CHIP_SELECT_PIN); mux_idx++) {
    digitalWrite(MUXES_CHIP_SELECT_PIN[mux_idx], target_mux_idx == mux_idx ? HIGH : LOW);
    delay(1);
  }
}

void select_chan(int chan_idx) {
  for (int pin_idx = 0; pin_idx < COUNT_OF(MUX_CHAN_SELECT_PINS); pin_idx++) {
    int b = bitRead(chan_idx, pin_idx);
    digitalWrite(MUX_CHAN_SELECT_PINS[pin_idx], b == 1 ? HIGH : LOW);
    delay(100);
  }
}


//float ntc(int NTC_PIN) {
//  float raw = analogRead(NTC_PIN);
////  Serial.printf("raw=%f\n", raw);
//  float maxAdc = (float)((1 << ADC_BITS) - 1);
//
//  // Проверка на ошибки (обрыв или КЗ)
//  if (raw <= 0 || raw >= maxAdc) return -999;
//
//  // 1. Расчет сопротивления термистора для вашей схемы:
//  // Rt = R_pullup / (MaxADC / raw - 1)
//  float resistance = (float)NTC_PULLUP_RESISTANCE * (raw / (maxAdc - raw));
//
//  // 2. Уравнение Стейнхарта-Харта
//  float temp;
//  temp = log(resistance / NTC_RESISTANCE);       // ln(R/Ro)
//  temp /= NTC_B_VALUE;                           // 1/B * ln(R/Ro)
//  temp += 1.0f / (NTC_BASE_TEMP + 273.15f);      // + 1/To
//  temp = 1.0f / temp - 273.15f;                  // Инвертируем и в Цельсии
//
//  return temp;
//}
