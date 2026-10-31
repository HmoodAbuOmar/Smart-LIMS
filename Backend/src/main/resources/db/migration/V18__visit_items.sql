CREATE TABLE visit_items (
 visit_id UUID NOT NULL REFERENCES visits(id), order_item_id UUID NOT NULL REFERENCES order_items(id),
 PRIMARY KEY(visit_id,order_item_id)
);
CREATE INDEX visit_items_item_idx ON visit_items(order_item_id,visit_id);
