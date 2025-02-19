import { BigNumber } from 'ethers';
import { ChainAdapter, ChainProtocol, Transaction } from '../chain/abstract';
import { ChainRegistry } from '../chain/registry';

export interface CrossChainMessage {
  id: string;
  sourceChain: ChainProtocol;
  targetChain: ChainProtocol;
  sender: string;
  recipient: string;
  payload: any;
  gasLimit?: BigNumber;
  nonce?: number;
}

export interface MessageStatus {
  status: 'pending' | 'delivered' | 'failed';
  sourceHash?: string;
  targetHash?: string;
  error?: string;
}

export class CrossChainMessenger {
  private messages: Map<string, MessageStatus> = new Map();
  private registry: ChainRegistry;

  constructor(
    private sourceAdapter: ChainAdapter,
    private targetAdapter: ChainAdapter
  ) {
    this.registry = ChainRegistry.getInstance();
  }

  async sendMessage(message: CrossChainMessage): Promise<string> {
    // 验证链支持
    if (!this.validateChainSupport(message)) {
      throw new Error('Chain not supported or bridge not available');
    }

    // 构建跨链消息交易
    const tx: Transaction = await this.buildMessageTransaction(message);

    // 发送源链交易
    const sourceHash = await this.sourceAdapter.sendTransaction(tx);

    // 记录消息状态
    this.messages.set(message.id, {
      status: 'pending',
      sourceHash,
    });

    // 启动消息监控
    this.monitorMessage(message.id);

    return message.id;
  }

  private validateChainSupport(message: CrossChainMessage): boolean {
    const sourceMetadata = this.registry.getChainMetadata(message.sourceChain);
    const targetMetadata = this.registry.getChainMetadata(message.targetChain);

    if (!sourceMetadata || !targetMetadata) {
      return false;
    }

    // 检查是否支持跨链桥
    const sourceBridge = this.registry.isFeatureSupported(
      message.sourceChain,
      'bridge'
    );
    const targetBridge = this.registry.isFeatureSupported(
      message.targetChain,
      'bridge'
    );

    return sourceBridge && targetBridge;
  }

  private async buildMessageTransaction(
    message: CrossChainMessage
  ): Promise<Transaction> {
    // 这里需要根据具体的跨链桥协议构建交易
    // 示例实现
    return {
      hash: '',
      from: message.sender,
      to: this.getBridgeAddress(message.sourceChain),
      value: BigNumber.from(0),
      data: this.encodeMessageData(message),
      nonce: message.nonce,
    };
  }

  private getBridgeAddress(chain: ChainProtocol): string {
    // 从注册表获取桥合约地址
    const metadata = this.registry.getChainMetadata(chain);
    const bridgeFeature = metadata?.features.find(f => f.name === 'bridge');
    return bridgeFeature?.params?.address || '';
  }

  private encodeMessageData(message: CrossChainMessage): string {
    // 编码跨链消息数据
    // 实际实现需要根据具体的桥协议
    return '0x';
  }

  private async monitorMessage(messageId: string) {
    const message = this.messages.get(messageId);
    if (!message || !message.sourceHash) return;

    try {
      // 监控源链交易确认
      const sourceTx = await this.sourceAdapter.getTransaction(message.sourceHash);
      if (!sourceTx) {
        throw new Error('Source transaction not found');
      }

      // 等待目标链确认
      // 实际实现需要监听桥合约事件
      
      this.messages.set(messageId, {
        ...message,
        status: 'delivered',
      });
    } catch (error) {
      this.messages.set(messageId, {
        ...message,
        status: 'failed',
        error: error.message,
      });
    }
  }

  getMessageStatus(messageId: string): MessageStatus | undefined {
    return this.messages.get(messageId);
  }

  async waitForCompletion(messageId: string, timeout = 300000): Promise<MessageStatus> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = this.getMessageStatus(messageId);
      
      if (!status) {
        throw new Error('Message not found');
      }

      if (status.status === 'delivered' || status.status === 'failed') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Message completion timeout');
  }
} 