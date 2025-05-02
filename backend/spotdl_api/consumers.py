from channels.generic.websocket import AsyncJsonWebsocketConsumer


class ProgressConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.task_id = self.scope["url_route"]["kwargs"]["task_id"]
        self.group_name = f"download_{self.task_id}"
        # Join the group for this task
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # Handler for messages sent with type="progress_update"
    async def progress_update(self, event):
        await self.send_json(event["data"])

    # Handler for messages sent with type="download_complete"
    async def download_complete(self, event):
        await self.send_json(event["data"])
        await self.close()
