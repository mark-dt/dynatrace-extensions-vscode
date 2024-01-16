/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

import mock = require("mock-fs");
import { DirectoryItems } from "mock-fs/lib/filesystem";
import * as vscode from "vscode";
import { DatasourceName } from "../../../../src/interfaces/extensionMeta";
import {
  RemoteTarget,
  SimulationConfig,
  SimulatorData,
} from "../../../../src/interfaces/simulator";
import { SimulatorManager } from "../../../../src/statusBar/simulator";
import * as conditionCheckers from "../../../../src/utils/conditionCheckers";
import * as extensionPartsingUtils from "../../../../src/utils/extensionParsing";
import * as fileSystemUtils from "../../../../src/utils/fileSystem";
import * as otherExtensionsUtils from "../../../../src/utils/otherExtensions";
import * as simulatorUtils from "../../../../src/utils/simulator";
import * as webviewPanel from "../../../../src/webviews/webviewPanel";
import { MockExtensionContext, MockUri } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

describe("Simulator Manager", () => {
  let mockContext: vscode.ExtensionContext;
  let panelManager: webviewPanel.WebviewPanelManager;
  let simulatorManager: SimulatorManager;

  beforeAll(() => {
    mock({ mock: {} });
    panelManager = new webviewPanel.WebviewPanelManager(new MockUri("mock.extension.uri"));
    mockContext = new MockExtensionContext();
  });

  beforeEach(() => {
    simulatorManager = new SimulatorManager(mockContext, panelManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    mock.restore();
  });

  describe("checkMantatoryRequirements", () => {
    it("should return false along with failed checks", () => {
      jest.spyOn(fileSystemUtils, "getExtensionFilePath").mockReturnValue(undefined);
      jest.spyOn(extensionPartsingUtils, "getDatasourceName").mockReturnValue("unsupported");

      const [status, failedChecks] = simulatorManager.checkMantatoryRequirements();

      expect(status).toBe(false);
      expect(failedChecks).toContain("Manifest");
      expect(failedChecks).toContain("Datasource");
      expect(failedChecks).toContain("Activation file");
      expect(simulatorManager.simulatorStatus).toBe("UNSUPPORTED");
    });

    test.each([
      {
        condition: "simulator.json doesn't exist on non-python extension",
        datasource: "snmp",
        mockFs: {},
      },
      {
        condition: "simulator.json & extension folder don't exist on python extension",
        datasource: "python",
        mockFs: { mock: { "extension": {}, "my-workspace": {} } },
      },
      {
        condition: "simulator.json & activation.json don't exist on python extension",
        datasource: "python",
        mockFs: { mock: { "extension": {}, "my-workspace": { extension: {} } } },
      },
    ])("activation file check fails if $condition", ({ datasource, mockFs }) => {
      mock(mockFs as DirectoryItems);
      jest.spyOn(fileSystemUtils, "getExtensionFilePath").mockReturnValue("mock/extension");
      jest
        .spyOn(extensionPartsingUtils, "getDatasourceName")
        .mockReturnValue(datasource as DatasourceName);
      jest
        .spyOn(vscode.workspace, "workspaceFolders", "get")
        .mockReturnValue([
          { index: 0, name: "MockWorkspace", uri: new MockUri("mock/my-workspace") },
        ]);

      const [status, failedChecks] = simulatorManager.checkMantatoryRequirements();

      expect(status).toBe(false);
      expect(failedChecks).toContain("Activation file");
      expect(simulatorManager.simulatorStatus).toBe("UNSUPPORTED");
    });

    it("should pass and update with valid checked details", () => {
      mock({ mock: { myWorkspace: { config: { "simulator.json": "" } } } });
      jest
        .spyOn(vscode.workspace, "workspaceFolders", "get")
        .mockReturnValue([
          { index: 0, name: "MockWorkspace", uri: new MockUri("mock/myWorkspace") },
        ]);
      jest
        .spyOn(fileSystemUtils, "getExtensionFilePath")
        .mockReturnValue("mock/myWorkspace/extension");
      jest.spyOn(extensionPartsingUtils, "getDatasourceName").mockReturnValue("snmp");

      const [status, failedChecks] = simulatorManager.checkMantatoryRequirements();

      expect(status).toBe(true);
      expect(failedChecks).toHaveLength(0);
      expect(simulatorManager.simulatorStatus).toBe("READY");
    });
  });

  describe("checkSimulationConfig", () => {
    const mockTarget: RemoteTarget = {
      name: "mockTarget",
      address: "mockHost",
      eecType: "ONEAGENT",
      osType: "LINUX",
      privateKey: "mockKey",
      username: "mockUser",
    };

    it("should fail check on LOCAL for python extension if dt-sdk not found", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "python");
      jest.spyOn(otherExtensionsUtils, "getPythonVenvOpts").mockReturnValue(Promise.resolve({}));
      jest.spyOn(conditionCheckers, "checkDtSdkPresent").mockReturnValue(Promise.resolve(false));
      const expectedStatus = "NOTREADY";
      const expectedMessage = "Python SDK not found";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "LOCAL",
        "ONEAGENT",
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on LOCAL for non-python extension if DS can't be simulated", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "canSimulateDatasource").mockReturnValue(false);
      const expectedStatus = "NOTREADY";
      const expectedMessage = "Datasource mockDS cannot be simulated on this OS";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "LOCAL",
        "ONEAGENT",
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on LOCAL for non-python extension if DS exe doesn't exist", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "canSimulateDatasource").mockReturnValue(true);
      jest.spyOn(simulatorUtils, "getDatasourcePath").mockReturnValue("mock/dsLocation");
      const expectedStatus = "NOTREADY";
      const expectedMessage = "Could not find datasource executable at mock/dsLocation";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "LOCAL",
        "ONEAGENT",
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);

      mock.restore();
    });

    it("should fail check on REMOTE for python extension", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "python");
      const expectedStatus = "NOTREADY";
      const expectedMessage = "Python datasource can only be simulated on local machine";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "REMOTE",
        "ONEAGENT",
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on REMOTE for non-python if target missing", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      const expectedStatus = "NOTREADY";
      const expectedMessage = "No target given for remote simulation";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "REMOTE",
        "ONEAGENT",
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should fail check on REMOTE for non-python if DS can't be simulated", async () => {
      const canSimulateDatasourceSpy = jest.spyOn(simulatorUtils, "canSimulateDatasource");
      canSimulateDatasourceSpy.mockReturnValue(false);
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      const expectedStatus = "NOTREADY";
      const expectedMessage = `Datasource mockDS cannot be simulated on ${mockTarget.osType}`;

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "REMOTE",
        "ONEAGENT",
        mockTarget,
      );

      expect(canSimulateDatasourceSpy).toHaveBeenCalledWith(
        mockTarget.osType,
        mockTarget.eecType,
        "mockDS",
      );
      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should pass check on LOCAL for python if dt-sdk exists", async () => {
      jest.replaceProperty(simulatorManager, "datasourceName", "python");
      jest.spyOn(otherExtensionsUtils, "getPythonVenvOpts").mockReturnValue(Promise.resolve({}));
      jest.spyOn(conditionCheckers, "checkDtSdkPresent").mockReturnValue(Promise.resolve(true));
      const expectedStatus = "READY";
      const expectedMessage = "";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "LOCAL",
        "ONEAGENT",
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });

    it("should pass check on LOCAL for non-python if DS exists and can be simulated", async () => {
      mock({ mock: { dsLocation: "" } });
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "canSimulateDatasource").mockReturnValue(true);
      jest.spyOn(simulatorUtils, "getDatasourcePath").mockReturnValue("mock/dsLocation");
      const expectedStatus = "READY";
      const expectedMessage = "";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "LOCAL",
        "ONEAGENT",
      );

      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);

      mock.restore();
    });

    it("should pass check on REMOTE for non-python if target exists and DS can be simulated", async () => {
      mock({ mock: { dsLocation: "" } });
      const canSimulateDatasourceSpy = jest.spyOn(simulatorUtils, "canSimulateDatasource");
      canSimulateDatasourceSpy.mockReturnValue(true);
      jest.replaceProperty(simulatorManager, "datasourceName", "mockDS");
      jest.spyOn(simulatorUtils, "getDatasourcePath").mockReturnValue("mock/dsLocation");
      const expectedStatus = "READY";
      const expectedMessage = "";

      const [actualStatus, actualMessage] = await simulatorManager.checkSimulationConfig(
        "REMOTE",
        "ONEAGENT",
        mockTarget,
      );

      expect(canSimulateDatasourceSpy).toHaveBeenCalledWith(
        mockTarget.osType,
        mockTarget.eecType,
        "mockDS",
      );
      expect(actualStatus).toBe(expectedStatus);
      expect(actualMessage).toBe(expectedMessage);
    });
  });

  describe("checkReady", () => {
    let renderSpy: jest.SpyInstance;
    let postMessageSpy: jest.SpyInstance;
    const fallbackConfigValue: SimulationConfig = {
      eecType: "ONEAGENT",
      location: "LOCAL",
      sendMetrics: false,
    };
    const mockPanelData: SimulatorData = {
      targets: [],
      summaries: [],
      currentConfiguration: fallbackConfigValue,
      specs: {
        isPython: false,
        dsSupportsActiveGateEec: false,
        dsSupportsOneAgentEec: false,
        localActiveGateDsExists: false,
        localOneAgentDsExists: false,
      },
      status: "UNSUPPORTED",
      statusMessage: "undefined",
      failedChecks: [],
    };

    beforeEach(() => {
      jest.spyOn(fileSystemUtils, "getSimulatorTargets").mockReturnValue([]);
      jest.spyOn(fileSystemUtils, "getSimulatorSummaries").mockReturnValue([]);
      renderSpy = jest.spyOn(panelManager, "render").mockImplementation(() => {});
      postMessageSpy = jest.spyOn(panelManager, "postMessage").mockImplementation(() => {});
    });

    it("first updates the panel with CHECKING status (render)", async () => {
      jest.spyOn(simulatorManager, "checkMantatoryRequirements").mockReturnValue([true, []]);

      await simulatorManager.checkReady(true);

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy).toHaveBeenNthCalledWith(
        1,
        webviewPanel.REGISTERED_PANELS.SIMULATOR_UI,
        "Extension Simulator",
        { dataType: "SIMULATOR_DATA", data: { ...mockPanelData, status: "CHECKING" } },
      );
    });

    it("first updates the panel with CHECKING status (postMessage)", async () => {
      jest.spyOn(simulatorManager, "checkMantatoryRequirements").mockReturnValue([true, []]);

      await simulatorManager.checkReady(false);

      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenNthCalledWith(
        1,
        webviewPanel.REGISTERED_PANELS.SIMULATOR_UI,
        {
          messageType: "updateData",
          data: { dataType: "SIMULATOR_DATA", data: { ...mockPanelData, status: "CHECKING" } },
        },
      );
    });

    it("then updates the panel with READY state and panel data", async () => {
      jest.spyOn(simulatorManager, "checkMantatoryRequirements").mockReturnValue([true, []]);

      await simulatorManager.checkReady(true);

      expect(renderSpy).toHaveBeenNthCalledWith(
        2,
        webviewPanel.REGISTERED_PANELS.SIMULATOR_UI,
        "Extension Simulator",
        { dataType: "SIMULATOR_DATA", data: { ...mockPanelData, status: "READY" } },
      );
    });

    it("updates the panel with UNSUPPORTED for mandatory check failures", async () => {
      const mockFailedChecks = ["a", "b", "c"];
      jest
        .spyOn(simulatorManager, "checkMantatoryRequirements")
        .mockReturnValue([false, mockFailedChecks]);

      await simulatorManager.checkReady(true);

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy).toHaveBeenNthCalledWith(
        2,
        webviewPanel.REGISTERED_PANELS.SIMULATOR_UI,
        "Extension Simulator",
        {
          dataType: "SIMULATOR_DATA",
          data: { ...mockPanelData, status: "UNSUPPORTED", failedChecks: mockFailedChecks },
        },
      );
    });

    it("updates the panel with NOTREADY for simulation config check failures", async () => {
      jest.spyOn(simulatorManager, "checkMantatoryRequirements").mockReturnValue([true, []]);
      jest
        .spyOn(simulatorManager, "checkSimulationConfig")
        .mockReturnValue(Promise.resolve(["NOTREADY", "mockMessage"]));

      await simulatorManager.checkReady(true, fallbackConfigValue);

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(renderSpy).toHaveBeenNthCalledWith(
        2,
        webviewPanel.REGISTERED_PANELS.SIMULATOR_UI,
        "Extension Simulator",
        {
          dataType: "SIMULATOR_DATA",
          data: { ...mockPanelData, status: "NOTREADY", statusMessage: "mockMessage" },
        },
      );
    });
  });
});
