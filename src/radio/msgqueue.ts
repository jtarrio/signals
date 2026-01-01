// Copyright 2024 Jacobo Tarrio Barreiro. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/** The type returned by the Channel.receive() function. */
type ReceivedMessage<MsgType, AckType = void> = {
  msg: MsgType;
  ack: (_: AckType) => void;
};

/** A message channel, in which messages are sent and received asynchronously. */
export class Channel<MsgType, AckType = void> {
  constructor() {
    this.sendQueue = [];
    this.rcvQueue = [];
  }

  /** Messages waiting to be delivered. */
  private sendQueue: ReceivedMessage<MsgType, AckType>[];
  /** Clients waiting to receive messages. */
  private rcvQueue: ((msg: MsgType) => Promise<AckType>)[];

  /**
   * Sends a message.
   *
   * If there is a client waiting to receive a message, it is delivered straight to it.
   * Otherwise, the message is added to the queue.
   *
   * @returns a promise that resolves when the receiver of the message acknowledges it.
   */
  async send(msg: MsgType): Promise<AckType> {
    let rcv = this.rcvQueue.shift();
    if (rcv !== undefined) {
      return rcv(msg);
    }
    let { promise, resolve } = Promise.withResolvers<AckType>();
    this.sendQueue.push({ msg, ack: resolve });
    return promise;
  }

  /**
   * Receives a message.
   *
   * @returns a promise that resolves to a message and to an acknowledgement function.
   * This acknowledgement function must be called after processing the message so the promise
   * returned by the send() function will be resolved.
   */
  receive(): Promise<ReceivedMessage<MsgType, AckType>> {
    let sent = this.sendQueue.shift();
    if (sent !== undefined) {
      return Promise.resolve(sent);
    }
    let msgPR = Promise.withResolvers<ReceivedMessage<MsgType, AckType>>();
    this.rcvQueue.push((msg: MsgType): Promise<AckType> => {
      let ackPR = Promise.withResolvers<AckType>();
      msgPR.resolve({ msg: msg, ack: ackPR.resolve });
      return ackPR.promise;
    });
    return msgPR.promise;
  }
}
