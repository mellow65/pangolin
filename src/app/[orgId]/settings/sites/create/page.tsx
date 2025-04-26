"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { StrategySelect } from "@app/components/StrategySelect";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@app/components/ui/input";
import { Terminal, InfoIcon } from "lucide-react";
import { Button } from "@app/components/ui/button";
import CopyTextBox from "@app/components/CopyTextBox";
import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { FaWindows, FaApple, FaFreebsd, FaDocker } from "react-icons/fa";
import { Checkbox } from "@app/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { generateKeypair } from "../[niceId]/wireguardConfig";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import {
    CreateSiteBody,
    CreateSiteResponse,
    PickSiteDefaultsResponse
} from "@server/routers/site";
import { toast } from "@app/hooks/useToast";
import { AxiosResponse } from "axios";
import { useParams, useRouter } from "next/navigation";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator
} from "@app/components/ui/breadcrumb";
import Link from "next/link";

const createSiteFormSchema = z
    .object({
        name: z
            .string()
            .min(2, {
                message: "Name must be at least 2 characters."
            })
            .max(30, {
                message: "Name must not be longer than 30 characters."
            }),
        method: z.string(),
        copied: z.boolean()
    })
    .refine(
        (data) => {
            if (data.method !== "local") {
                return data.copied;
            }
            return true;
        },
        {
            message: "Please confirm that you have copied the config.",
            path: ["copied"]
        }
    );

type CreateSiteFormValues = z.infer<typeof createSiteFormSchema>;

type Commands = {
    mac: Record<string, string[]>;
    linux: Record<string, string[]>;
    windows: Record<string, string[]>;
    docker: Record<string, string[]>;
};

export default function Page() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();

    const [tunnelTypes, setTunnelTypes] = useState<any>([
        {
            id: "newt",
            title: "Newt Tunnel (Recommended)",
            description:
                "Easiest way to create an entrypoint into your network. No extra setup.",
            disabled: true
        },
        {
            id: "wireguard",
            title: "Basic WireGuard",
            description:
                "Use any WireGuard client to establish a tunnel. Manual NAT setup required.",
            disabled: true
        },
        {
            id: "local",
            title: "Local",
            description: "Local resources only. No tunneling."
        }
    ]);

    const [loadingPage, setLoadingPage] = useState(true);

    const [platform, setPlatform] = useState("linux");
    const [architecture, setArchitecture] = useState("amd64");
    const [commands, setCommands] = useState<Commands | null>(null);

    const [newtId, setNewtId] = useState("");
    const [newtSecret, setNewtSecret] = useState("");
    const [newtEndpoint, setNewtEndpoint] = useState("");

    const [publicKey, setPublicKey] = useState("");
    const [privateKey, setPrivateKey] = useState("");
    const [wgConfig, setWgConfig] = useState("");

    const [createLoading, setCreateLoading] = useState(false);

    const [siteDefaults, setSiteDefaults] =
        useState<PickSiteDefaultsResponse | null>(null);

    const hydrateWireGuardConfig = (
        privateKey: string,
        publicKey: string,
        subnet: string,
        address: string,
        endpoint: string,
        listenPort: string
    ) => {
        const wgConfig = `[Interface]
Address = ${subnet}
ListenPort = 51820
PrivateKey = ${privateKey}

[Peer]
PublicKey = ${publicKey}
AllowedIPs = ${address.split("/")[0]}/32
Endpoint = ${endpoint}:${listenPort}
PersistentKeepalive = 5`;
        setWgConfig(wgConfig);
    };

    const hydrateCommands = (
        id: string,
        secret: string,
        endpoint: string,
        version: string
    ) => {
        const commands = {
            mac: {
                "Apple Silicon (arm64)": [
                    `curl -L -o newt "https://github.com/fosrl/newt/releases/download/${version}/newt_darwin_arm64" && chmod +x ./newt`,
                    `./newt --id ${id} --secret ${secret} --endpoint ${endpoint}`
                ],
                "Intel x64 (amd64)": [
                    `curl -L -o newt "https://github.com/fosrl/newt/releases/download/${version}/newt_darwin_amd64" && chmod +x ./newt`,
                    `./newt --id ${id} --secret ${secret} --endpoint ${endpoint}`
                ]
            },
            linux: {
                amd64: [
					'wget -O newt_installer.sh "https://raw.githubusercontent.com/mellow65/newt_installer/refs/heads/main/newt_installer.sh" && chmod +x ./newt_installer.sh'
					'./newt_install.sh --id ${id} --secret ${secret} --endpoint ${endpoint} --version ${version} --architecture "newt_linux_amd64"'
                ],
                arm64: [
					'wget -O newt_installer.sh "https://raw.githubusercontent.com/mellow65/newt_installer/refs/heads/main/newt_installer.sh" && chmod +x ./newt_installer.sh'
					'./newt_install.sh --id ${id} --secret ${secret} --endpoint ${endpoint} --version ${version} --architecture "newt_linux_arm64"'
                ],
                arm32: [
					'wget -O newt_installer.sh "https://raw.githubusercontent.com/mellow65/newt_installer/refs/heads/main/newt_installer.sh" && chmod +x ./newt_installer.sh'
					'./newt_install.sh --id ${id} --secret ${secret} --endpoint ${endpoint} --version ${version} --architecture "newt_linux_arm32"'
                ],
                arm32v6: [
					'wget -O newt_installer.sh "https://raw.githubusercontent.com/mellow65/newt_installer/refs/heads/main/newt_installer.sh" && chmod +x ./newt_installer.sh'
					'./newt_install.sh --id ${id} --secret ${secret} --endpoint ${endpoint} --version ${version} --architecture "newt_linux_arm32v6"'
                ],
                riscv64: [
					'wget -O newt_installer.sh "https://raw.githubusercontent.com/mellow65/newt_installer/refs/heads/main/newt_installer.sh" && chmod +x ./newt_installer.sh'
					'./newt_install.sh --id ${id} --secret ${secret} --endpoint ${endpoint} --version ${version} --architecture "newt_linux_arm32v6"'
                ]
            },
            freebsd: {
                amd64: [
                    `fetch -o newt "https://github.com/fosrl/newt/releases/download/${version}/newt_freebsd_amd64" && chmod +x ./newt`,
                    `./newt --id ${id} --secret ${secret} --endpoint ${endpoint}`
                ],
                arm64: [
                    `fetch -o newt "https://github.com/fosrl/newt/releases/download/${version}/newt_freebsd_arm64" && chmod +x ./newt`,
                    `./newt --id ${id} --secret ${secret} --endpoint ${endpoint}`
                ]
            },
            windows: {
                x64: [
                    `curl -o newt.exe -L "https://github.com/fosrl/newt/releases/download/${version}/newt_windows_amd64.exe"`,
                    `newt.exe --id ${id} --secret ${secret} --endpoint ${endpoint}`
                ]
            },
            docker: {
                "Docker Compose": [
                    `services:
  newt:
    image: fosrl/newt
    container_name: newt
    restart: unless-stopped
    environment:
      - PANGOLIN_ENDPOINT=${endpoint}
      - NEWT_ID=${id}
      - NEWT_SECRET=${secret}`
                ],
                "Docker Run": [
                    `docker run -it fosrl/newt --id ${id} --secret ${secret} --endpoint ${endpoint}`
                ]
            }
        };
        setCommands(commands);
    };

    const getArchitectures = () => {
        switch (platform) {
            case "linux":
                return ["amd64", "arm64", "arm32", "arm32v6", "riscv64"];
            case "mac":
                return ["Apple Silicon (arm64)", "Intel x64 (amd64)"];
            case "windows":
                return ["x64"];
            case "docker":
                return ["Docker Compose", "Docker Run"];
            case "freebsd":
                return ["amd64", "arm64"];
            default:
                return ["x64"];
        }
    };

    const getPlatformName = (platformName: string) => {
        switch (platformName) {
            case "windows":
                return "Windows";
            case "mac":
                return "macOS";
            case "docker":
                return "Docker";
            case "freebsd":
                return "FreeBSD";
            default:
                return "Linux";
        }
    };

    const getCommand = () => {
        const placeholder = ["Unknown command"];
        if (!commands) {
            return placeholder;
        }
        let platformCommands = commands[platform as keyof Commands];

        if (!platformCommands) {
            // get first key
            const firstPlatform = Object.keys(commands)[0];
            platformCommands = commands[firstPlatform as keyof Commands];

            setPlatform(firstPlatform);
        }

        let architectureCommands = platformCommands[architecture];
        if (!architectureCommands) {
            // get first key
            const firstArchitecture = Object.keys(platformCommands)[0];
            architectureCommands = platformCommands[firstArchitecture];

            setArchitecture(firstArchitecture);
        }

        return architectureCommands || placeholder;
    };

    const getPlatformIcon = (platformName: string) => {
        switch (platformName) {
            case "windows":
                return <FaWindows className="h-4 w-4 mr-2" />;
            case "mac":
                return <FaApple className="h-4 w-4 mr-2" />;
            case "docker":
                return <FaDocker className="h-4 w-4 mr-2" />;
            case "freebsd":
                return <FaFreebsd className="h-4 w-4 mr-2" />;
            default:
                return <Terminal className="h-4 w-4 mr-2" />;
        }
    };

    const form = useForm({
        resolver: zodResolver(createSiteFormSchema),
        defaultValues: {
            name: "",
            copied: false,
            method: "newt"
        }
    });

    async function onSubmit(data: CreateSiteFormValues) {
        setCreateLoading(true);

        let payload: CreateSiteBody = {
            name: data.name,
            type: data.method
        };

        if (data.method == "wireguard") {
            if (!siteDefaults || !wgConfig) {
                toast({
                    variant: "destructive",
                    title: "Error creating site",
                    description: "Key pair or site defaults not found"
                });
                setCreateLoading(false);
                return;
            }

            payload = {
                ...payload,
                subnet: siteDefaults.subnet,
                exitNodeId: siteDefaults.exitNodeId,
                pubKey: publicKey
            };
        }
        if (data.method === "newt") {
            if (!siteDefaults) {
                toast({
                    variant: "destructive",
                    title: "Error creating site",
                    description: "Site defaults not found"
                });
                setCreateLoading(false);
                return;
            }

            payload = {
                ...payload,
                subnet: siteDefaults.subnet,
                exitNodeId: siteDefaults.exitNodeId,
                secret: siteDefaults.newtSecret,
                newtId: siteDefaults.newtId
            };
        }

        const res = await api
            .put<
                AxiosResponse<CreateSiteResponse>
            >(`/org/${orgId}/site/`, payload)
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: "Error creating site",
                    description: formatAxiosError(e)
                });
            });

        if (res && res.status === 201) {
            const data = res.data.data;

            router.push(`/${orgId}/settings/sites/${data.niceId}`);
        }

        setCreateLoading(false);
    }

    useEffect(() => {
        const load = async () => {
            setLoadingPage(true);

            let newtVersion = "latest";

            try {
                const response = await fetch(
                    `https://api.github.com/repos/fosrl/newt/releases/latest`
                );
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch release info: ${response.statusText}`
                    );
                }
                const data = await response.json();
                const latestVersion = data.tag_name;
                newtVersion = latestVersion;
            } catch (error) {
                console.error("Error fetching latest release:", error);
            }

            const generatedKeypair = generateKeypair();

            const privateKey = generatedKeypair.privateKey;
            const publicKey = generatedKeypair.publicKey;

            setPrivateKey(privateKey);
            setPublicKey(publicKey);

            await api
                .get(`/org/${orgId}/pick-site-defaults`)
                .catch((e) => {
                    // update the default value of the form to be local method
                    form.setValue("method", "local");
                })
                .then((res) => {
                    if (res && res.status === 200) {
                        const data = res.data.data;

                        setSiteDefaults(data);

                        const newtId = data.newtId;
                        const newtSecret = data.newtSecret;
                        const newtEndpoint = data.endpoint;

                        setNewtId(newtId);
                        setNewtSecret(newtSecret);
                        setNewtEndpoint(newtEndpoint);

                        hydrateCommands(
                            newtId,
                            newtSecret,
                            env.app.dashboardUrl,
                            newtVersion
                        );

                        hydrateWireGuardConfig(
                            privateKey,
                            data.publicKey,
                            data.subnet,
                            data.address,
                            data.endpoint,
                            data.listenPort
                        );

                        setTunnelTypes((prev: any) => {
                            return prev.map((item: any) => {
                                return {
                                    ...item,
                                    disabled: false
                                };
                            });
                        });
                    }
                });

            setLoadingPage(false);
        };

        load();
    }, []);

    return (
        <>
            <div className="mb-4 flex-row">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <Link href="../">Sites</Link>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>Create Site</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </div>

            <div className="flex justify-between">
                <HeaderTitle
                    title="Create Site"
                    description="Follow the steps below to create and connect a new site"
                />
                <Button
                    variant="outline"
                    onClick={() => {
                        router.push(`/${orgId}/settings/sites`);
                    }}
                >
                    See All Sites
                </Button>
            </div>

            {!loadingPage && (
                <div>
                    <SettingsContainer>
                        <SettingsSection>
                            <SettingsSectionHeader>
                                <SettingsSectionTitle>
                                    Site Information
                                </SettingsSectionTitle>
                            </SettingsSectionHeader>
                            <SettingsSectionBody>
                                <SettingsSectionForm>
                                    <Form {...form}>
                                        <form
                                            className="space-y-4"
                                            id="create-site-form"
                                        >
                                            <FormField
                                                control={form.control}
                                                name="name"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            Name
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                autoComplete="off"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                        <FormDescription>
                                                            This is the
                                                            display name for the
                                                            site.
                                                        </FormDescription>
                                                    </FormItem>
                                                )}
                                            />
                                        </form>
                                    </Form>
                                </SettingsSectionForm>
                            </SettingsSectionBody>
                        </SettingsSection>

                        <SettingsSection>
                            <SettingsSectionHeader>
                                <SettingsSectionTitle>
                                    Tunnel Type
                                </SettingsSectionTitle>
                                <SettingsSectionDescription>
                                    Determine how you want to connect to your
                                    site
                                </SettingsSectionDescription>
                            </SettingsSectionHeader>
                            <SettingsSectionBody>
                                <StrategySelect
                                    options={tunnelTypes}
                                    defaultValue={
                                        form.getValues("method") as string
                                    }
                                    onChange={(value) =>
                                        form.setValue("method", value)
                                    }
                                    cols={3}
                                />
                            </SettingsSectionBody>
                        </SettingsSection>

                        {form.watch("method") === "newt" && (
                            <>
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            Newt Credentials
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            This is how Newt will authenticate
                                            with the server
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <InfoSections cols={3}>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    Newt Endpoint
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={
                                                            env.app.dashboardUrl
                                                        }
                                                    />
                                                </InfoSectionContent>
                                            </InfoSection>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    Newt ID
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={newtId}
                                                    />
                                                </InfoSectionContent>
                                            </InfoSection>
                                            <InfoSection>
                                                <InfoSectionTitle>
                                                    Newt Secret Key
                                                </InfoSectionTitle>
                                                <InfoSectionContent>
                                                    <CopyToClipboard
                                                        text={newtSecret}
                                                    />
                                                </InfoSectionContent>
                                            </InfoSection>
                                        </InfoSections>

                                        <Alert variant="neutral" className="">
                                            <InfoIcon className="h-4 w-4" />
                                            <AlertTitle className="font-semibold">
                                                Save Your Credentials
                                            </AlertTitle>
                                            <AlertDescription>
                                                You will only be able to see
                                                this once. Make sure to copy it
                                                to a secure place.
                                            </AlertDescription>
                                        </Alert>

                                        <Form {...form}>
                                            <form
                                                className="space-y-4"
                                                id="create-site-form"
                                            >
                                                <FormField
                                                    control={form.control}
                                                    name="copied"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <div className="flex items-center space-x-2">
                                                                <Checkbox
                                                                    id="terms"
                                                                    defaultChecked={
                                                                        form.getValues(
                                                                            "copied"
                                                                        ) as boolean
                                                                    }
                                                                    onCheckedChange={(
                                                                        e
                                                                    ) => {
                                                                        form.setValue(
                                                                            "copied",
                                                                            e as boolean
                                                                        );
                                                                    }}
                                                                />
                                                                <label
                                                                    htmlFor="terms"
                                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                                >
                                                                    I have
                                                                    copied the
                                                                    config
                                                                </label>
                                                            </div>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </form>
                                        </Form>
                                    </SettingsSectionBody>
                                </SettingsSection>

                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            Install Newt
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            Get Newt running on your system
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <div>
                                            <p className="font-bold mb-3">
                                                Operating System
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                                {[
                                                    "linux",
                                                    "docker",
                                                    "mac",
                                                    "windows",
                                                    "freebsd"
                                                ].map((os) => (
                                                    <Button
                                                        key={os}
                                                        variant={
                                                            platform === os
                                                                ? "squareOutlinePrimary"
                                                                : "squareOutline"
                                                        }
                                                        className={`flex-1 min-w-[120px] ${platform === os ? "bg-primary/10" : ""}`}
                                                        onClick={() => {
                                                            setPlatform(os);
                                                        }}
                                                    >
                                                        {getPlatformIcon(os)}
                                                        {getPlatformName(os)}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="font-bold mb-3">
                                                {platform === "docker"
                                                    ? "Method"
                                                    : "Architecture"}
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                                {getArchitectures().map(
                                                    (arch) => (
                                                        <Button
                                                            key={arch}
                                                            variant={
                                                                architecture ===
                                                                arch
                                                                    ? "squareOutlinePrimary"
                                                                    : "squareOutline"
                                                            }
                                                            className={`flex-1 min-w-[120px] ${architecture === arch ? "bg-primary/10" : ""}`}
                                                            onClick={() =>
                                                                setArchitecture(
                                                                    arch
                                                                )
                                                            }
                                                        >
                                                            {arch}
                                                        </Button>
                                                    )
                                                )}
                                            </div>
                                            <div className="pt-4">
                                                <p className="font-bold mb-3">
                                                    Commands
                                                </p>
                                                <div className="mt-2">
                                                    <CopyTextBox
                                                        text={getCommand().join(
                                                            "\n"
                                                        )}
                                                        outline={true}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </SettingsSectionBody>
                                </SettingsSection>
                            </>
                        )}

                        {form.watch("method") === "wireguard" && (
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        WireGuard Configuration
                                    </SettingsSectionTitle>
                                    <SettingsSectionDescription>
                                        Use the following configuration to
                                        connect to your network
                                    </SettingsSectionDescription>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <CopyTextBox text={wgConfig} />

                                    <Alert variant="neutral">
                                        <InfoIcon className="h-4 w-4" />
                                        <AlertTitle className="font-semibold">
                                            Save Your Credentials
                                        </AlertTitle>
                                        <AlertDescription>
                                            You will only be able to see this
                                            once. Make sure to copy it to a
                                            secure place.
                                        </AlertDescription>
                                    </Alert>

                                    <Form {...form}>
                                        <form
                                            className="space-y-4"
                                            id="create-site-form"
                                        >
                                            <FormField
                                                control={form.control}
                                                name="copied"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id="terms"
                                                                defaultChecked={
                                                                    form.getValues(
                                                                        "copied"
                                                                    ) as boolean
                                                                }
                                                                onCheckedChange={(
                                                                    e
                                                                ) => {
                                                                    form.setValue(
                                                                        "copied",
                                                                        e as boolean
                                                                    );
                                                                }}
                                                            />
                                                            <label
                                                                htmlFor="terms"
                                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                            >
                                                                I have copied
                                                                the config
                                                            </label>
                                                        </div>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </form>
                                    </Form>
                                </SettingsSectionBody>
                            </SettingsSection>
                        )}
                    </SettingsContainer>

                    <div className="flex justify-end space-x-2 mt-8">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                router.push(`/${orgId}/settings/sites`);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                form.handleSubmit(onSubmit)();
                            }}
                        >
                            Create Site
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}
