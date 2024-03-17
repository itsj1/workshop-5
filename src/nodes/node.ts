import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import axios from 'axios';
import { delay } from "../utils";
import http from "http";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  type NodeState = {
    killed: boolean; // this is used to know if the node was stopped by the /stop route. It's important for the unit tests but not very relevant for the Ben-Or implementation
    x: 0 | 1 | "?" | null; // the current consensus value
    decided: boolean | null; // used to know if the node reached finality
    k: number | null; // current step of the node
  };

  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();
  let currentNodeState: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null,
  }

  // TODO implement this
  // this route allows retrieving the current status of the node
  // node.get("/status", (req, res) => {});
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });


  // TODO implement this
  // this route is used to start the consensus algorithm
  // node.get("/start", async (req, res) => {});
  node.get("/start", async (req, res) => {
    let nodesReady = false;
    while (!nodesReady) {
      nodesReady = nodesAreReady();
      await delay(5);
    }
    if (!isFaulty) {
      currentNodeState = { k: 1, x: initialValue, decided: false, killed: currentNodeState.killed };
      for (let i = 0; i < N; i++) {
        sendMessage(`http://localhost:${BASE_NODE_PORT + i}/message`, { k: currentNodeState.k, x: currentNodeState.x, messageType: "propose" });
      }
    } else {
      currentNodeState = { k: null, x: null, decided: null, killed: currentNodeState.killed };
    }
    res.status(200).send("Consensus algorithm started.");
  });


  // TODO implement this
  // this route is used to stop the consensus algorithm
  // node.get("/stop", async (req, res) => {});
  node.get("/stop", (req, res) => {
    currentNodeState.killed = true;
    res.status(200).send("Node stopped");
  });



  // TODO implement this
  // get the current state of a node
  // node.get("/getState", (req, res) => {});
  node.get("/getState", (req, res) => {
    res.status(200).send(currentNodeState);
  });



  // TODO implement this
  // this route allows the node to receive messages from other nodes
  // node.post("/message", (req, res) => {});
  node.post("/message", async (req, res) => {
    let { k, x, messageType } = req.body;
    if (!isFaulty && !currentNodeState.killed) {
      if (messageType == "propose") {
        if (!proposals.has(k)) {
          proposals.set(k, []);
        }
        proposals.get(k)!.push(x);
        let proposal = proposals.get(k)!;
        if (proposal.length >= (N - F)) {
          let count0 = proposal.filter((el) => el == 0).length;
          let count1 = proposal.filter((el) => el == 1).length;
          let decision;
          if (count0 > (N / 2)) {
            decision = 0;
          } else if (count1 > (N / 2)) {
            decision = 1;
          } else {
            decision = "?";
          }
          for (let i = 0; i < N; i++) {
            sendMessage(`http://localhost:${BASE_NODE_PORT + i}/message`, { k: k, x: decision, messageType: "vote" });
          }
        }
      } else if (messageType == "vote") {
        if (!votes.has(k)) {
          votes.set(k, []);
        }
        votes.get(k)!.push(x);
        let vote = votes.get(k)!;
        if (vote.length >= (N - F)) {
          let count0 = vote.filter((el) => el == 0).length;
          let count1 = vote.filter((el) => el == 1).length;
          if (count0 >= F + 1) {
            currentNodeState.x = 0;
            currentNodeState.decided = true;
          } else if (count1 >= F + 1) {
            currentNodeState.x = 1;
            currentNodeState.decided = true;
          } else {
            if (count0 + count1 > 0 && count0 > count1) {
              currentNodeState.x = 0;
            } else if (count0 + count1 > 0 && count0 < count1) {
              currentNodeState.x = 1;
            } else {
              currentNodeState.x = Math.random() > 0.5 ? 0 : 1;
            }
            currentNodeState.k = k + 1;
            for (let i = 0; i < N; i++) {
              sendMessage(`http://localhost:${BASE_NODE_PORT + i}/message`, { k: currentNodeState.k, x: currentNodeState.x, messageType: "propose" });
            }
          }
        }
      }
    }
    res.status(200).send("Message received and processed.");
  });

  //Pour faire des testes
  const sendToAllNodes = async (message: any) => {
    // Send the message to each node in the network
    for (let nodeId = 0; nodeId < N; nodeId++) {
      try {
        await axios.post(`http://localhost:${BASE_NODE_PORT + nodeId}/message`, message);
      } catch (error) {
        console.error(`Error sending message to node ${nodeId}:`);
      }
    }
  };

  async function sendMessage(url : string, body:any) {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    try {
      const response = await fetch(url, {
        ...options,
        body: JSON.stringify(body)
      });
      const data = await response.json();
    } catch (error) {
    }
  }



  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });
  return server;
}




