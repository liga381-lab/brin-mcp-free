
INSERT INTO routing_rules (condition_key, condition_value, target_workflow, confidence_weight)
VALUES
 ('taskType', 'notification', 'worker-notification-prod', 1.00),
 ('taskType', 'api_integration', 'worker-api-integration-prod', 1.00),
 ('taskType', 'data_processing', 'worker-data-processing-prod', 1.00)
ON CONFLICT DO NOTHING;
