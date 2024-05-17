import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { SessionManager } from '../core/abc/manager.abc';
import { WhatsappSession } from '../core/abc/session.abc';
import { parseBool } from '../helpers';
import { GetChatMessagesQuery } from '../structures/chats.dto';
import { EditMessageRequest } from '../structures/chatting.dto';
import {
  ChatIdApiParam,
  MessageIdApiParam,
  SessionApiParam,
  SessionParam,
} from './helpers';

@ApiSecurity('api_key')
@Controller('api/:session/chats')
@ApiTags('chats')
class ChatsController {
  constructor(private manager: SessionManager) { }

  @Get('')
  @SessionApiParam
  @ApiOperation({ summary: 'Get all chats' })
  getAllChats(@SessionParam session: WhatsappSession) {
    return session.getChats();
  }

  @Delete(':chatId')
  @SessionApiParam
  @ApiOperation({ summary: 'Deletes the chat' })
  deleteChat(
    @SessionParam session: WhatsappSession,
    @Param('chatId') chatId: string,
  ) {
    return session.deleteChat(chatId);
  }

  @Post(':chatId/pin')
  @SessionApiParam
  @ApiOperation({ summary: 'Pin the chat' })
  pinChat(
    @SessionParam session: WhatsappSession,
    @Param('chatId') chatId: string,
  ) {
    return session.pinChat(chatId);
  }

  @Post(':chatId/unpin')
  @SessionApiParam
  @ApiOperation({ summary: 'Unpin the chat' })
  unpinChat(
    @SessionParam session: WhatsappSession,
    @Param('chatId') chatId: string,
  ) {
    return session.unpinChat(chatId);
  }

  @Get(':chatId/messages')
  @SessionApiParam
  @ApiOperation({ summary: 'Gets messages in the chat' })
  getChatMessages(
    @Query() query: GetChatMessagesQuery,
    @SessionParam session: WhatsappSession,
    @Param('chatId') chatId: string,
  ) {
    const downloadMedia = parseBool(query.downloadMedia);
    return session.getChatMessages(chatId, query.limit, downloadMedia);
  }

  @Delete(':chatId/messages')
  @SessionApiParam
  @ApiOperation({ summary: 'Clears all messages from the chat' })
  clearMessages(
    @SessionParam session: WhatsappSession,
    @Param('chatId') chatId: string,
  ) {
    return session.clearMessages(chatId);
  }

  @Delete(':chatId/messages/:messageId')
  @SessionApiParam
  @ChatIdApiParam
  @MessageIdApiParam
  @ApiOperation({ summary: 'Deletes a message from the chat' })
  deleteMessage(
    @SessionParam session: WhatsappSession,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
  ) {
    return session.deleteMessage(chatId, messageId);
  }

  @Put(':chatId/messages/:messageId')
  @SessionApiParam
  @ChatIdApiParam
  @MessageIdApiParam
  @ApiOperation({ summary: 'Edits a message in the chat' })
  editMessage(
    @SessionParam session: WhatsappSession,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
    @Body() body: EditMessageRequest,
  ) {
    return session.editMessage(chatId, messageId, body);
  }
}

export { ChatsController };
