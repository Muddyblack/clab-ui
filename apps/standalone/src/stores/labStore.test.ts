import assert from "node:assert/strict";
import test from "node:test";
import { useLabStore } from "./labStore";

test.beforeEach(() => {
  useLabStore.getState().clear();
});

test("processEvent merges interface-stats events keyed by attributes.interface", () => {
  const store = useLabStore.getState();

  store.processEvent({
    type: "container",
    action: "start",
    attributes: {
      name: "clab-demo-srl1",
      lab: "demo",
      "container-id": "abc123",
      "clab-node-name": "srl1",
      "clab-node-kind": "nokia_srlinux",
      state: "running",
      status: "Up"
    }
  });

  store.processEvent({
    type: "interface",
    action: "create",
    attributes: {
      name: "clab-demo-srl1",
      lab: "demo",
      ifname: "e1-1",
      alias: "ethernet-1/1",
      state: "up",
      type: "veth",
      mac: "02:42:ac:11:00:01",
      mtu: "1500"
    }
  });

  store.processEvent({
    type: "interface-stats",
    action: "stats",
    attributes: {
      name: "clab-demo-srl1",
      lab: "demo",
      interface: "e1-1",
      rx_bps: 1234,
      tx_bps: 5678,
      rx_bytes: 120,
      tx_bytes: 240,
      interval_seconds: 1
    }
  });

  const container = useLabStore.getState().labs.get("demo")?.containers.get("clab-demo-srl1");
  const iface = container?.interfaces.get("e1-1");

  assert.ok(iface);
  assert.equal(iface.alias, "ethernet-1/1");
  assert.equal(iface.type, "veth");
  assert.equal(iface.mac, "02:42:ac:11:00:01");
  assert.equal(iface.rxBps, "1234");
  assert.equal(iface.txBps, "5678");
  assert.equal(iface.rxBytes, "120");
  assert.equal(iface.txBytes, "240");
  assert.equal(iface.statsIntervalSeconds, "1");
});

test("stats-only updates preserve existing interface metadata", () => {
  const store = useLabStore.getState();

  store.processEvent({
    type: "container",
    action: "start",
    attributes: {
      name: "clab-demo-srl2",
      lab: "demo"
    }
  });

  store.processEvent({
    type: "interface",
    action: "create",
    attributes: {
      name: "clab-demo-srl2",
      lab: "demo",
      ifname: "eth1",
      alias: "server-link",
      state: "up",
      type: "veth",
      mac: "02:42:ac:11:00:02",
      mtu: "9000"
    }
  });

  store.processEvent({
    type: "interface-stats",
    action: "stats",
    attributes: {
      name: "clab-demo-srl2",
      lab: "demo",
      interface: "eth1",
      rx_packets: 88,
      tx_packets: 99
    }
  });

  const iface = useLabStore.getState().labs.get("demo")?.containers.get("clab-demo-srl2")?.interfaces.get("eth1");
  assert.ok(iface);
  assert.equal(iface.alias, "server-link");
  assert.equal(iface.state, "up");
  assert.equal(iface.type, "veth");
  assert.equal(iface.mac, "02:42:ac:11:00:02");
  assert.equal(iface.mtu, "9000");
  assert.equal(iface.rxPackets, "88");
  assert.equal(iface.txPackets, "99");
});
