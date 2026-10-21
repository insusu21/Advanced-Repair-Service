INSERT INTO service_center(id,code,name,region,address,phone) OVERRIDING SYSTEM VALUE VALUES (1,'SEOUL','Seoul','Seoul','Demo Seoul','02-000-0000'),(2,'BUSAN','Busan','Busan','Demo Busan','051-000-0000') ON CONFLICT DO NOTHING;
INSERT INTO factory(id,name,country,region,address,phone) OVERRIDING SYSTEM VALUE VALUES (1,'Demo factory','KR','Gyeonggi','Demo factory address','031-000-0000') ON CONFLICT DO NOTHING;
INSERT INTO product_model(id,model_code,name) OVERRIDING SYSTEM VALUE VALUES (1,'R1','Robot R1'),(2,'R2','Robot R2') ON CONFLICT DO NOTHING;
INSERT INTO part(id,part_number,name,category) OVERRIDING SYSTEM VALUE VALUES (1,'MOTOR-001','Wheel motor','MOTOR'),(2,'LIDAR-001','Lidar','OTHER') ON CONFLICT DO NOTHING;
INSERT INTO model_part VALUES (1,1),(2,2) ON CONFLICT DO NOTHING;
INSERT INTO part_supplier VALUES (1,1,3),(2,1,5) ON CONFLICT DO NOTHING;
INSERT INTO part_lot(id,part_id,factory_id,lot_number) OVERRIDING SYSTEM VALUE VALUES (1,1,1,'LOT-MOTOR-001') ON CONFLICT DO NOTHING;
INSERT INTO product(id,serial_number,model_id,information) OVERRIDING SYSTEM VALUE VALUES (1,'ROBOT-SEOUL-001',1,'{"manufacturer":"Demo","specifications":{"batteryWh":60}}'),(2,'ROBOT-BUSAN-001',2,'{"manufacturer":"Demo"}') ON CONFLICT DO NOTHING;
INSERT INTO product_component(id,product_id,part_id,lot_id,slot_code,installed_at) OVERRIDING SYSTEM VALUE VALUES (1,1,1,1,'MOTOR-LEFT',now()-interval '1 year'),(2,2,2,NULL,'LIDAR',now()-interval '1 year') ON CONFLICT DO NOTHING;
INSERT INTO warehouse(id,name,region,address,phone) OVERRIDING SYSTEM VALUE VALUES (1,'Central warehouse','Seoul','Demo warehouse','02-000-0000') ON CONFLICT DO NOTHING;
INSERT INTO inventory(warehouse_id,part_id,on_hand,reserved) VALUES (1,1,10,0),(1,2,0,0) ON CONFLICT DO NOTHING;
-- [통합] PCB 부품이 없어 AI가 PCB 결함에 추천할 부품이 없었다. 재고 0 → 공장 발주 분기도 보이게
INSERT INTO part(id,part_number,name,category) OVERRIDING SYSTEM VALUE VALUES (3,'PCB-001','Main PCB','PCB') ON CONFLICT DO NOTHING;
INSERT INTO model_part VALUES (1,3),(2,3) ON CONFLICT DO NOTHING;
INSERT INTO part_supplier VALUES (3,1,7) ON CONFLICT DO NOTHING;
INSERT INTO inventory(warehouse_id,part_id,on_hand,reserved) VALUES (1,3,0,0) ON CONFLICT DO NOTHING;
-- [통합] 프론트 접수 화면의 예시 시리얼. DB에 없어 "요청한 정보를 찾을 수 없습니다"가 떴다
INSERT INTO product(id,serial_number,model_id,manufactured_on,information) OVERRIDING SYSTEM VALUE VALUES (3,'RC2026000187',1,'2026-01-15','{"manufacturer":"Demo","specifications":{"batteryWh":60}}') ON CONFLICT DO NOTHING;
-- [통합] 접수 API는 firmware 필수인데 제품 정보에 없어서 프론트 접수가 400으로 실패했다
UPDATE product SET information=information||'{"firmware":"1.0.3"}'::jsonb WHERE NOT information ? 'firmware';
