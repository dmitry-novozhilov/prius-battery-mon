#include <BLEDevice.h>
#include <BLEServer.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLECharacteristic *pCharacteristic;

void setup() {
  BLEDevice::init("Prius-battery-mon");
  BLEServer *pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
                    );
  pService->start();
  BLEDevice::getAdvertising()->start();
}

void loop() {
  char buf[100];
  for(int i=0; i<28; i++) {
    int sensorValue = analogRead(A0);
    sprintf(buf, "{\"cell\":%d,\"temp\":%d}", i, sensorValue);
    pCharacteristic->setValue(buf);
    pCharacteristic->notify(); // Отправка данных подключенному браузеру
  }
  delay(1000);
}
